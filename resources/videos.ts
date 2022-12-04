import { Context, APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createVideo, findVideo, listVideos } from './repository';


export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
  // logging event is helpful when developing
  console.log('Event', event)
  const { resource, httpMethod } = event;

  // event contains information about the API resource
  if (resource === '/videos' && httpMethod === 'GET') {

    // retrieve videos
    const videos = await listVideos()

    // return response
    return {
      statusCode: 200,
      body: JSON.stringify({ videos })
    };
  }

  else if (resource === '/videos/{id}' && httpMethod === 'GET') {
    const { pathParameters } = event;
    const video = await findVideo(pathParameters?.id!)

    if (video) {
      // if videos with specified id exist return 200
      return {
        statusCode: 200,
        body: JSON.stringify(video)
      };
    } else {
      // otherwise return 404 error
      return {
        statusCode: 404,
        body: 'NotFound'
      };
    }
  }

  if (resource === '/videos' && httpMethod === 'POST') {
    // at this point we are sure the body correct - request validator is guarding that
    // we just need to parse it from string
    // `!` is a TS trick - TS does not know that body was already validated
    const dto = JSON.parse(event.body!)

    // create a video
    const video = await createVideo(dto.title)

    // return response
    return {
      statusCode: 201,
      body: JSON.stringify(video)
    };
  }

  // in case someone tries to call our lambda with unknown resource return 404
  return {
    statusCode: 404,
    body: 'NotFound'
  };
}