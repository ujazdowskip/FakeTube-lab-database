#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FakeTubeApiStack } from '../lib/fake_tube_api-stack';

const app = new cdk.App();


new FakeTubeApiStack(app, 'FakeTubeApiStack');