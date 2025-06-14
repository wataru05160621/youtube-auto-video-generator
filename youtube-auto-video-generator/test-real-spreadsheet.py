#!/usr/bin/env python3
"""
Test ReadSpreadsheet Lambda function with real Google Sheets ID
"""
import json
import boto3
import os

def test_read_real_spreadsheet():
    """Test ReadSpreadsheet Lambda function with real spreadsheet ID"""

    # Initialize Lambda client
    lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

    # Function name
    function_name = 'videogen-readspreadsheet-dev'

    # Test payload with real spreadsheet ID
    payload = {
        "spreadsheetId": "1LynUd8B4xuzmoTp5JwnBsZsAJ8M1Apbx271NyChXIo0",
        "sheetName": "Sheet1",
        "range": "A1:Z100"
    }

    print("Testing ReadSpreadsheet Lambda function with real Google Sheets...")
    print(f"Payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")

    try:
        print("Invoking Lambda function...")
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        print("Lambda invocation completed.")
        print(f"\nResponse Status Code: {response['StatusCode']}")

        # Read response payload
        response_payload = json.loads(response['Payload'].read())
        print(f"Response: {json.dumps(response_payload, indent=2, ensure_ascii=False)}")

        # Check if successful
        if response['StatusCode'] == 200:
            if response_payload.get('statusCode') == 200:
                print("\n✅ Test passed successfully!")
                return True
            else:
                print(f"\n❌ Lambda function returned error: {response_payload}")
                return False
        else:
            print(f"\n❌ Lambda invocation failed with status code: {response['StatusCode']}")
            return False

    except Exception as e:
        print(f"\n❌ Test failed with exception: {str(e)}")
        return False

if __name__ == "__main__":
    print("=" * 80)
    print("Real Google Sheets Integration Test")
    print("=" * 80)
    success = test_read_real_spreadsheet()
    print("=" * 80)
    print(f"Test Result: {'PASSED' if success else 'FAILED'}")
    print("=" * 80)
