# Aim of the lab

We will redesign our application from the last labs with real persistence layer. After the exercises our endpoints will store and retrieve data from DynamoDB database.


# Prerequisites

1. Installing packages

```
npm install
```

2. Bootstrapping

This will create the project in the AWS.

> ❗️ You can find the `bootstrap-template.yml` file inside the project.

```
cdk bootstrap --template bootstrap-template.yaml 
```

3. Deploy

Run `cdk deploy`. Make sure deployment went well and we have API gatewa that exposes three endpoint:

1. `GET /videos`
2. `POST /videos`
3. `GET /videos/{id}`

For now the responses are fixed. Don't worry we will fix that in upcoming exercises.

# Exercise 1: DynamoDB table

In this exercise we will create separate stack that will create DynamoDB table. When application grows it is considered a good practice to modularize it. It also applies to our infrastructure code. We will divide our application into two separate stacks:

- API stack - all infrastructure for API Gateway and Lambdas
- Database stack - provisioning of DynamoDB table

> ❗️ Different parts of application changes at different paces. As you will see we will need to deploy API stack much more often than database. Having two separate stack is good for maintainability.

## Create stack scaffolding

1. Create a new file in `lib` folder - `fake_tube_database-stack.ts`
2. Create empty stack

```ts
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class FakeTubeDatabaseStack extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

  }
}
```
3. Import DynamoDB module

```ts
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
```

4. Create DynamoDB resource (inside stack constructor)

```ts
    new dynamodb.Table(this, 'VideoTable', {
      partitionKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
    });
```

## Integrate database stack with our application

To integrate our new database stack we need to do couple things.

1. Import it in the `bin/fake_tube.ts` file

```ts
import { FakeTubeDatabaseStack } from '../lib/fake_tube_database-stack';
```

2. Instantiate `FaKeTubeDatabaseStack` before our `FakeTubeApiStack`

```diff
const app = new cdk.App();

+new FakeTubeDatabaseStack(app, 'FakeTubeDatabaseStack', {
+  synthesizer: defaultStackSynthesizer,
+})

new FakeTubeApiStack(app, 'FakeTubeApiStack', {
  synthesizer: defaultStackSynthesizer,
});
```

## Deploy

Now we can deploy our application.

Let's try our good old deploy command.

1. Run `cdk deploy`

Oops. You should see the following error

```
Bundling asset FakeTubeApiStack/VideoHandler/Code/Stage...

  cdk.out/bundling-temp-23e905c4ef2d049349842606a338f3c8a8413ce94c5ecc688fc901ae829903da/index.js  19.1kb

⚡ Done in 22ms

Since this app includes more than a single stack, specify which stacks to use (wildcards are supported) or specify `--all`
Stacks: FakeTubeApiStack · FakeTubeDatabaseStack
```

After we introduced multiple stacks into our application CDK needs to be sure what exactly should be deployed.

Let's try to deploy all the stacks:

1. Run `cdk deploy --all`

Later we will use more granular deployments.

## Test

Now let's ensure that our table is in fact deployed to AWS.

1. Open AWS console
2. In the top search field look for `dynamodb`
3. Open the DynamoDb service
4. From the left sidebar pick `Tables`

There you should see you new table. You can snoop around the tabs to get familiar. For now our database is empty and not connected to our API. Let's fix that.

# Exercise 2: link our lambda and DynamoDB

In this exercise we will write some code that will allow our lambda to connect to the table created in exercise 1.

## Client creation

DynamoDB is a service which exposes HTTP interfaces. This is one of the differences with more traditional relational databases. Instead of persistent connection(s) we have just HTTP endpoint that we can call. AWS is providing SDK to abstract some things needed to connect and interact with DynamoDB tables.

You can read about it more [here](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SQLtoNoSQL.Accessing.html).

1. Create new file in `resources` folder - `db.ts`.

Because our application grows it make sense to spread it into multiple files (separation of concers).

> ❗️ Notice that since last labs we already refactored our application. Check out `resources/repository.ts` file. We will put there all the code that is concerned about interaction with DynamoDB table.

2. Paste the following code into `db.ts`

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export function getDynamoClient() {
  const ddbClient = new DynamoDBClient({});
  return DynamoDBDocumentClient.from(ddbClient);
}
```

AWS SDK is providing a lot of useful things. Apart from authentication and translation of parameters into HTTP calls it will also provide you with retries.

## Describe table

1. Import our db util in the `resources/repository.ts` file.

```ts
import { getDynamoClient } from './db';
```

2. Get the client inside `listVideos` function

```diff
export async function listVideos(): Promise<Video[]> {
+ const dynamo = getDynamoClient()
  return []
}
```

3. Describe the table

Describe operation will tell you some details about our table and it will allow us to check if we have connection. 

Import the following at the top of `resources/repository.ts`

```ts
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
```

Then send describe command via the client.

```diff
export async function listVideos(): Promise<Video[]> {
  const dynamo = getDynamoClient()
+ const describeResult = dynamo.send(new DescribeTableCommand())
+ console.log('DESCRIBE', JSON.stringify(describeResult))
  return []
}
```

Oops! You should see Typescript error. It turns our that `DescribeTableCommand` needs some input. Refactor the code:

```diff
export async function listVideos(): Promise<Video[]> {
  const dynamo = getDynamoClient()
- const describeResult = dynamo.send(new DescribeTableCommand())
+ const describeResult = await dynamo.send(new DescribeTableCommand({
+   TableName: 'TODO: inject' // where table name ???
+ }))
  console.log('DESCRIBE', JSON.stringify(describeResult))
  return []
}
```

Oops! Sounds like we are missing the table name. But wait, isn't table name just `VideoTable` like we defined in the `FakeTubeDatabaseStack`. Well not exactly.

> ❗️ CDK is generating table name based on you configuration. Table name must be unique for you account and region. Thus CDK is adding some random part to avoid clashes between stacks. Our generated table name will look sth like this: `FakeTubeDatabaseStack-VideoTableE38FEE4B-QLJMA1H458D3`. This is why we should inject table name.

## Inject table name into the lambda

Because our database and lambda are defined in two different stacks we need some way to share data between them. Stacks are just Typescript classes and we can define public properties on them. We will use that mechanism to export DynamoDB table from database stack and inject it into API stack.

1. define `table` property on `FakeTubeDatabaseStack` class in the `lib/fake_tube_database-stack.ts.ts` file

Add the following before the constructor
```diff
export class FakeTubeDatabaseStack extends Stack {

+ public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
```

Inside the constructor rafactor the code and assign created table to the `table` property.

```diff
-   new dynamodb.Table(this, 'VideoTable', {
+   this.table = new dynamodb.Table(this, 'VideoTable', {
      partitionKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
    });
```

2. Refactor `FakeTubeApiStack` to accept table as configuration option

In the `lib/fake_tube_api-stack.ts` import dynamo module:

```ts
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
```

Now we need to refactor our API stack to make it accept dynamo db table. In the `lib/fake_tube_api-stack.ts` past the following code (just after the imports at the top):

```ts
interface FakeTubeApiProps extends StackProps {
  table: dynamodb.Table
}
```

Change the `FakeTubeApiStack` constructor to look like the following:

```diff
export class FakeTubeApiStack extends Stack {
- constructor(scope: Construct, id: string, props?: StackProps) {
+ constructor(scope: Construct, id: string, props: FakeTubeApiProps) {
    super(scope, id, props);
```

Now we just need to inject table name into our handler. In the `lib/fake_tube_api-stack.ts` refactor handler creation in the following way:

```diff
    const handler = new nodejsLambda.NodejsFunction(this, "VideoHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: 'resources/videos.ts',
+     environment: {
+       VIDEOS_TABLE_NAME: props.table.tableName
+     }
    });

+   props.table.grantReadWriteData(handler); // grant access
```

3. Inject `table` into the `FakeTubeApiStack`

Refactor `bin/fake_tube.ts` to inject table:

```diff
const app = new cdk.App();

-new FakeTubeDatabaseStack(app, 'FakeTubeDatabaseStack')
+const databaseStack = new FakeTubeDatabaseStack(app, 'FakeTubeDatabaseStack')

-new FakeTubeApiStack(app, 'FakeTubeApiStack');
+new FakeTubeApiStack(app, 'FakeTubeApiStack', {
+  table: databaseStack.table
+});
```

4. Use injected table name

Now we can finally use our table name in the lambda. In the `resources/repository.ts` refactor the code:

```diff
  const describeResult = await dynamo.send(new DescribeTableCommand({
-   TableName: 'TODO: inject' // where table name ???
+   TableName: process.env.VIDEOS_TABLE_NAME
  }))
  console.log('DESCRIBE', JSON.stringify(describeResult))
```

## Test

No we can finally test our connection with DynamoDB table.

1. use `cdk deploy FakeTubeApiStack` command (notice that we don't need to deploy the database stack now)
2. call our `GET /videos` endpoint

```
curl -i https://<YOUR GW ID>.execute-api.eu-central-1.amazonaws.com/prod/videos
```

3. Go to the Lambda logs and look for for the describe result.

If the connection is successfull you should see `200` status code and data that is describing our table's basic information.

# Exercise 3: List all the videos 

Now let's refactor our `listVideos` in the `resources/repository.ts` file to actually use database.

## Create scan command:

Now when we now that we have a connection to the database we can use commands to retrieve actual data.

Import `ScanCommand` at the top of the file:

```ts
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
```

Replace describe with the scan command:

```diff
- const describeResult = await dynamo.send(new DescribeTableCommand({
-   TableName: process.env.VIDEOS_TABLE_NAME,
- }))
- console.log('DESCRIBE', JSON.stringify(describeResult))
+ const scanResult = await dynamo.send(new ScanCommand({
+   TableName: process.env.VIDEOS_TABLE_NAME,
+ }))
```

> ❗️ In reality it is not a good practice to use `ScanCommand`. It will traverse all data stored in the Dynamo table. For our use case it is fine but in real applications we would have to narrow this search down.

## Format response

Scan result is not a list of objects. It has more data and we need to format it to return proper values from our `listVideos` function. The scan result looks sth like this:

```json
{
    "$metadata": {
        "httpStatusCode": 200,
        "requestId": "HIDF76UAU8G08U0CMFT8MHODH7VV4KQNSO5AEMVJF66Q9ASUAAJG",
        "attempts": 1,
        "totalRetryDelay": 0
    },
    "Count": 1,
    "Items": [
        {
            "Title": "Video title",
            "Id": "a226f5b2-1910-4c78-8d33-38f8c814d143"
        },
    ],
    "ScannedCount": 1
}
```
Because `Items` property is marked as optional by the AWS SDK Typescript typings we need to add the following code:

```ts
  if (!scanResult.Items) {
    return []
  }
```
Simply return empty array.

After that we can format the actual response. Replace return at the end with:

```diff
  if (!scanResult.Items) {
    return []
  }
- return []
+ return scanResult.Items.map((item) => ({
+   id: item.Id,
+   title: item.Title,
+ }))
```

## Test

1. use `cdk deploy FakeTubeApiStack` command (notice that we don't need to deploy the database stack)
2. call our `GET /videos` endpoint

```
curl -i https://<YOUR GW ID>.execute-api.eu-central-1.amazonaws.com/prod/videos
```

You should receive `200` status and the empty `GET /videos` response (`{"videos":[]}`)

# Exercise 4: Create video

We would love to return something real from our `GET /videos` endpoint. To do that we have to actually create some data. Let's do this now.

Let's start with removing everything from inside `createVideo` function in the `resources/repository.ts` file.

## Import `PutCommand`

To send write operation we need to import another command. Modify our import statement at the top:

```diff
-import { ScanCommand } from "@aws-sdk/lib-dynamodb";
+import { ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
```

## Create db client

At the top of the `createVideo` function create db client:

```diff
export async function createVideo(title: string): Promise<Video> {
+ const dynamo = getDynamoClient()
}
```

## Create new object properties

Before we send data to DynamoDB we need to create an `id` for our new item.

```diff
export async function createVideo(title: string): Promise<Video> {
  const dynamo = getDynamoClient()
+ const id = uuid();
}
```

## Send data to DynamoDB 

We will use previously imported `PutCommand` to send write request to our dynamo table.

```diff
export async function createVideo(title: string): Promise<Video> {
  const dynamo = getDynamoClient()
  const id = uuid();
+ await dynamo.send(new PutCommand({
+   TableName: process.env.VIDEOS_TABLE_NAME,
+   Item: {
+     Id: id,
+     Title: title,
+   },
+ }))
}
```

## Return response

Lastly we want to return fresly created object:

```diff
export async function createVideo(title: string): Promise<Video> {
  const dynamo = getDynamoClient()
  const id = uuid();
  await dynamo.send(new PutCommand({
    TableName: process.env.VIDEOS_TABLE_NAME,
    Item: {
      Id: id,
      Title: title,
    },
  }))
+ return {
+   id,
+   title,
+ }
}
```

## Test

1. use `cdk deploy FakeTubeApiStack` command
2. create one video

```
curl -i -X POST https://<YOUR GW ID>.execute-api.eu-central-1.amazonaws.com/prod/videos -d '{"title": "Funny cats"}'
```

You should receive `201` status and the body of response should be JSON with you new video.

3. call our `GET /videos` endpoint

```
curl -i https://<YOUR GW ID>.execute-api.eu-central-1.amazonaws.com/prod/videos
```

You should receive list of your videos with previously created item inside.

# Exercise 5: Retrieve video by id

Finaly we can make our `GET /videos/<id>` to return item from database

## Import `GetCommand`

To send get operation we need to import another command. Modify our import statement at the top of the `resources/repository.ts` 

```diff
-import { ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
+import { ScanCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
```

## Create db client

At the top of the `findVideo` function create db client:

```diff
export async function findVideo(id: string): Promise<Video | undefined> {
+ const dynamo = getDynamoClient()
  return
}
```

## Send command to DynamoDB

```diff
export async function findVideo(id: string): Promise<Video | undefined> {
  const dynamo = getDynamoClient()
+ const result = await dynamo.send(new GetCommand({
+   TableName: process.env.VIDEOS_TABLE_NAME,
+   Key: {
+     Id: id,
+   },
+ }))
  return
}
```

## Format response

Again the result is not a single item. We need to format response properly.

When the `Item` property is empty that means there is no item with specified `id`. We can just return undefined.

```diff
export async function findVideo(id: string): Promise<Video | undefined> {
  const dynamo = getDynamoClient()
  const result = await dynamo.send(new GetCommand({
    TableName: process.env.VIDEOS_TABLE_NAME,
    Key: {
      Id: id,
    },
  }))
+ if (!result.Item) {
+   return
+ }
  return
}
```

Finally we can format our response.

```diff
export async function findVideo(id: string): Promise<Video | undefined> {
  const dynamo = getDynamoClient()
  const result = await dynamo.send(new GetCommand({
    TableName: process.env.VIDEOS_TABLE_NAME,
    Key: {
      Id: id,
    },
  }))
  if (!result.Item) {
    return
  }
- return
+ return {
+   id: result.Item.Id,
+   title: result.Item.Title,
+ }
}
```

## Test


1. use `cdk deploy FakeTubeApiStack` command
2. Create couple more videos using instructions from previous exercise.
3. List all videos using our `GET /videos` endpoint. Pick any id you want.
4. Use `GET /videos/{id} to test our implementation

```
curl -i https://<YOUR GW ID>.execute-api.eu-central-1.amazonaws.com/prod/videos/<any valid video id>
```

You should receive body with video you've picked.

```
curl -i https://<YOUR GW ID>.execute-api.eu-central-1.amazonaws.com/prod/videos/<non existing id>
```

You should receive `404` error.
