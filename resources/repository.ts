import { v4 as uuid } from 'uuid'
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { ScanCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

interface Video {
  id: string;
  title: string;
}

export async function listVideos(): Promise<Video[]> {
  return []
}

export async function findVideo(id: string): Promise<Video | undefined> {
  return
}

export async function createVideo(title: string): Promise<Video> {
  return {
    id: uuid(),
    title,
  }
}