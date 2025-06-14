#!/usr/bin/env python3
import boto3
import json

# Lambda client
lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

# Test payload for GenerateImage
test_payload = {
    "processedVideos": [
        {
            "id": "test-001",
            "title": "Test Video",
            "script": "This is a test script for image generation",
            "scriptGenerated": True,
            "rowIndex": 2
        }
    ]
}

try:
    print("Testing GenerateImage Lambda function...")
    print("Payload:", json.dumps(test_payload, indent=2))

    print("Invoking Lambda function...")
    response = lambda_client.invoke(
        FunctionName='videogen-generateimage-dev',
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
