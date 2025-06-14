#!/usr/bin/env python3
import boto3
import json

# Lambda client
lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

# Test payload for ReadSpreadsheet
test_payload = {
    "spreadsheetId": "test-spreadsheet-id",
    "sheetName": "Sheet1",
    "range": "A1:Z100"
}

try:
    print("Testing ReadSpreadsheet Lambda function...")
    print("Payload:", json.dumps(test_payload, indent=2))

    print("Invoking Lambda function...")
    response = lambda_client.invoke(
        FunctionName='videogen-readspreadsheet-dev',
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
