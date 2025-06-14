#!/usr/bin/env python3
import boto3
import json

# Lambda client
lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

# Test payload for UploadToYouTube
test_payload = {
    "composedVideos": [
        {
            "id": "test-001",
            "title": "Test Video",
            "description": "This is a test video description",
            "videoUrl": "https://example.com/test-video.mp4",
            "videoComposed": True,
            "rowIndex": 2
        }
    ]
}

try:
    print("Testing UploadToYouTube Lambda function...")
    print("Payload:", json.dumps(test_payload, indent=2, ensure_ascii=False))

    print("Invoking Lambda function...")
    response = lambda_client.invoke(
        FunctionName='videogen-uploadtoyoutube-dev',
        InvocationType='RequestResponse',
        Payload=json.dumps(test_payload)
    )

    print("Lambda invocation completed.")

    # Read the response
    response_payload = json.loads(response['Payload'].read())

    print("\nResponse Status Code:", response['StatusCode'])
    print("Response:", json.dumps(response_payload, indent=2, ensure_ascii=False))

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
