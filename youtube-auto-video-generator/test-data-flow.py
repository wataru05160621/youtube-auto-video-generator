#!/usr/bin/env python3
"""
Test data flow between Lambda functions to understand format issues
"""
import json
import boto3

def test_lambda_chain():
    """Test the chain of Lambda functions to understand data flow"""

    lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

    print("=" * 80)
    print("Testing Lambda Function Chain Data Flow")
    print("=" * 80)

    # 1. ReadSpreadsheet
    print("\n1️⃣ Testing ReadSpreadsheet...")
    read_payload = {
        "spreadsheetId": "1LynUd8B4xuzmoTp5JwnBsZsAJ8M1Apbx271NyChXIo0",
        "sheetName": "Sheet1",
        "range": "A1:Z100"
    }

    read_response = lambda_client.invoke(
        FunctionName='videogen-readspreadsheet-dev',
        Payload=json.dumps(read_payload)
    )

    read_result = json.loads(read_response['Payload'].read())
    print(f"   ✅ ReadSpreadsheet completed")
    print(f"   📊 Found {len(read_result.get('videosToProcess', []))} videos to process")

    if read_result.get('statusCode') != 200:
        print(f"   ❌ Error: {read_result.get('error')}")
        return

    # 2. GenerateScript
    print("\n2️⃣ Testing GenerateScript...")
    script_payload = {
        "videosToProcess": read_result.get('videosToProcess', [])[:1],  # Test with first video only
        "spreadsheetId": read_payload["spreadsheetId"]
    }

    script_response = lambda_client.invoke(
        FunctionName='videogen-generatescript-dev',
        Payload=json.dumps(script_payload)
    )

    script_result = json.loads(script_response['Payload'].read())
    print(f"   ✅ GenerateScript completed")
    print(f"   📝 Output keys: {list(script_result.keys())}")

    if script_result.get('statusCode') != 200:
        print(f"   ❌ Error: {script_result.get('error')}")
        return

    # Show what data is actually output
    processed_videos = script_result.get('processedVideos', [])
    if processed_videos:
        print(f"   📊 Processed {len(processed_videos)} videos")
        print(f"   🔑 First video keys: {list(processed_videos[0].keys())}")

    # 3. WriteScript
    print("\n3️⃣ Testing WriteScript...")
    write_payload = {
        "processedVideos": processed_videos,
        "spreadsheetId": read_payload["spreadsheetId"]
    }

    write_response = lambda_client.invoke(
        FunctionName='videogen-writescript-dev',
        Payload=json.dumps(write_payload)
    )

    write_result = json.loads(write_response['Payload'].read())
    print(f"   ✅ WriteScript completed")
    print(f"   📝 Output keys: {list(write_result.keys())}")

    if write_result.get('statusCode') != 200:
        print(f"   ❌ Error: {write_result.get('error')}")
        return

    print("\n🎉 Data flow test completed successfully!")
    print("Next step: Update Step Functions to use correct data formats")

if __name__ == "__main__":
    test_lambda_chain()
