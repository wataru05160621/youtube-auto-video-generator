#!/usr/bin/env python3
"""
Test UploadToYouTube function specifically
"""
import json
import boto3

def test_upload_youtube():
    lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

    # Test payload for UploadToYouTube
    payload = {
        "composedVideos": [
            {
                "title": "AI基礎入門",
                "description": "AI基礎入門の動画です。",
                "videoS3Key": "videos/test-video.mp4",
                "videoComposed": True,
                "rowIndex": 2
            }
        ]
    }

    print("Testing UploadToYouTube function...")
    print(f"Payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")

    try:
        response = lambda_client.invoke(
            FunctionName='videogen-uploadtoyoutube-dev',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        if response['StatusCode'] == 200:
            response_payload = json.loads(response['Payload'].read())
            print(f"Response: {json.dumps(response_payload, indent=2, ensure_ascii=False)}")

            if response_payload.get('statusCode') == 200:
                print("✅ UploadToYouTube test SUCCESS")
                return True
            else:
                print(f"❌ UploadToYouTube test FAILED: {response_payload.get('error')}")
                return False
        else:
            print(f"❌ HTTP error: {response['StatusCode']}")
            return False

    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return False

if __name__ == "__main__":
    test_upload_youtube()
