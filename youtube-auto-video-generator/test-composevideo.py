#!/usr/bin/env python3
import boto3
import json

# Lambda client
lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

# Test payload for ComposeVideo
test_payload = {
    "videosWithImages": [
        {
            "id": "test-001",
            "title": "Test Video",
            "images": [
                {
                    "url": "https://example.com/test-image.jpg",
                    "duration": 5
                }
            ],
            "rowIndex": 2
        }
    ],
    "videosWithAudio": [
        {
            "id": "test-001",
            "title": "Test Video",
            "audioUrl": "https://example.com/test-audio.mp3",
            "audioDuration": 10,
            "rowIndex": 2
        }
    ]
}

try:
    print("Testing ComposeVideo Lambda function...")
    print("Payload:", json.dumps(test_payload, indent=2, ensure_ascii=False))

    print("Invoking Lambda function...")
    response = lambda_client.invoke(
        FunctionName='videogen-composevideo-dev',
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
