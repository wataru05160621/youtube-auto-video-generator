#!/usr/bin/env python3
"""
Complete Integration Test Suite for Yo        'ComposeVideo': {
            "videosWithImages": [{
                "title": "AI基礎入門",
                "imageS3Key": "images/test-image.jpg",
                "rowIndex": 2
            }],
            "videosWithAudio": [{
                "title": "AI基礎入門",
                "audioS3Key": "audio/test-audio.mp3",
                "rowIndex": 2
            }]
        },
        'UploadToYouTube': {
            "composedVideos": [{
                "title": "AI基礎入門",
                "description": "AI基礎入門の動画です。",
                "videoS3Key": "videos/test-video.mp4",
                "rowIndex": 2
            }]
        } Generator
"""
import json
import boto3
import time

def test_all_lambda_functions():
    """Test all Lambda functions with updated function names"""

    lambda_client = boto3.client('lambda', region_name='ap-northeast-1')

    # Function names (updated)
    functions = {
        'ReadSpreadsheet': 'videogen-readspreadsheet-dev',
        'GenerateScript': 'videogen-generatescript-dev',
        'WriteScript': 'videogen-writescript-dev',
        'GenerateImage': 'videogen-generateimage-dev',
        'SynthesizeSpeech': 'videogen-synthesizespeech-dev',
        'ComposeVideo': 'videogen-composevideo-dev',
        'UploadToYouTube': 'videogen-uploadtoyoutube-dev'
    }

    # Test payloads
    test_data = {
        'ReadSpreadsheet': {
            "spreadsheetId": "1LynUd8B4xuzmoTp5JwnBsZsAJ8M1Apbx271NyChXIo0",
            "sheetName": "Sheet1",
            "range": "A1:Z100"
        },
        'GenerateScript': {
            "videosToProcess": [{
                "title": "AI基礎入門",
                "theme": "人工知能の基本概念",
                "target_audience": "初心者",
                "duration": "3分",
                "keywords": "AI 機械学習 基礎",
                "rowIndex": 2
            }]
        },
        'WriteScript': {
            "videosWithScripts": [{
                "title": "AI基礎入門",
                "script": "こんにちは！今日はAIについて学びましょう。",
                "description": "AI基礎入門の動画です。",
                "scriptGenerated": True,
                "rowIndex": 2
            }],
            "spreadsheetId": "1LynUd8B4xuzmoTp5JwnBsZsAJ8M1Apbx271NyChXIo0"
        },
        'GenerateImage': {
            "processedVideos": [{
                "title": "AI基礎入門",
                "script": "こんにちは！今日はAIについて学びましょう。",
                "rowIndex": 2
            }]
        },
        'SynthesizeSpeech': {
            "processedVideos": [{
                "title": "AI基礎入門",
                "script": "こんにちは！今日はAIについて学びましょう。",
                "rowIndex": 2
            }]
        },
        'ComposeVideo': {
            "videosWithImages": [{
                "title": "AI基礎入門",
                "imageS3Key": "images/test-image.jpg",
                "imageGenerated": True,
                "rowIndex": 2
            }],
            "videosWithAudio": [{
                "title": "AI基礎入門",
                "audioS3Key": "audio/test-audio.mp3",
                "audioGenerated": True,
                "rowIndex": 2
            }]
        },
        'UploadToYouTube': {
            "composedVideos": [{
                "title": "AI基礎入門",
                "description": "AI基礎入門の動画です。",
                "videoS3Key": "videos/test-video.mp4",
                "videoComposed": True,
                "rowIndex": 2
            }]
        }
    }

    print("=" * 80)
    print("Complete Lambda Functions Integration Test")
    print("=" * 80)

    results = {}

    for func_name, lambda_name in functions.items():
        print(f"\n🧪 Testing {func_name} ({lambda_name})...")

        try:
            payload = test_data[func_name]

            response = lambda_client.invoke(
                FunctionName=lambda_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )

            if response['StatusCode'] == 200:
                response_payload = json.loads(response['Payload'].read())

                if response_payload.get('statusCode') == 200:
                    print(f"   ✅ {func_name}: SUCCESS")
                    results[func_name] = 'SUCCESS'
                else:
                    print(f"   ❌ {func_name}: FAILED - {response_payload.get('error', 'Unknown error')}")
                    results[func_name] = 'FAILED'
            else:
                print(f"   ❌ {func_name}: FAILED - HTTP {response['StatusCode']}")
                results[func_name] = 'FAILED'

        except Exception as e:
            print(f"   ❌ {func_name}: ERROR - {str(e)}")
            results[func_name] = 'ERROR'

        time.sleep(1)  # Brief pause between tests

    # Summary
    print("\n" + "=" * 80)
    print("TEST RESULTS SUMMARY")
    print("=" * 80)

    success_count = sum(1 for status in results.values() if status == 'SUCCESS')
    total_count = len(results)

    for func_name, status in results.items():
        icon = "✅" if status == 'SUCCESS' else "❌"
        print(f"{icon} {func_name}: {status}")

    print(f"\n📊 Overall: {success_count}/{total_count} functions passed")

    if success_count == total_count:
        print("🎉 All Lambda functions are working correctly!")
        return True
    else:
        print("⚠️  Some functions need attention before full workflow test.")
        return False

if __name__ == "__main__":
    test_all_lambda_functions()
