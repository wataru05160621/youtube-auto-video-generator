#!/usr/bin/env python3
import boto3
import json

# Lambda client
lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

# Test payload for WriteScript
test_payload = {
    "processedVideos": [
        {
            "id": "test-001",
            "title": "Test Video",
            "script": "こんにちは！今日はテストビデオについてお話しします。",
            "scriptGenerated": True,
            "rowIndex": 2
        }
    ],
    "spreadsheetId": "test-spreadsheet-id"
}

try:
    print("Testing WriteScript Lambda function...")
    print("Payload:", json.dumps(test_payload, indent=2, ensure_ascii=False))

    print("Invoking Lambda function...")
    response = lambda_client.invoke(
        FunctionName='videogen-writescript-dev',
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
