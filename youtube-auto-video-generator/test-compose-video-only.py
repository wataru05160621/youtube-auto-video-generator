#!/usr/bin/env python3
"""
Test ComposeVideo function specifically
"""
import json
import boto3

def test_compose_video():
    lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

    # Test payload for ComposeVideo
    payload = {
        "videosWithImages": [
            {
                "title": "AI基礎入門",
                "imageS3Key": "images/test-image.jpg",
                "imageGenerated": True,
                "rowIndex": 2
            }
        ],
        "videosWithAudio": [
            {
                "title": "AI基礎入門",
                "audioS3Key": "audio/test-audio.mp3",
                "audioGenerated": True,
                "rowIndex": 2
            }
        ]
    }

    print("Testing ComposeVideo function...")
    print(f"Payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")

    try:
        response = lambda_client.invoke(
            FunctionName='videogen-composevideo-dev',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        if response['StatusCode'] == 200:
            response_payload = json.loads(response['Payload'].read())
            print(f"Response: {json.dumps(response_payload, indent=2, ensure_ascii=False)}")

            if response_payload.get('statusCode') == 200:
                print("✅ ComposeVideo test SUCCESS")
                return True
            else:
                print(f"❌ ComposeVideo test FAILED: {response_payload.get('error')}")
                return False
        else:
            print(f"❌ HTTP error: {response['StatusCode']}")
            return False

    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return False

if __name__ == "__main__":
    test_compose_video()
