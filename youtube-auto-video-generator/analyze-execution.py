#!/usr/bin/env python3
"""
Analyze Step Functions execution in detail
"""
import json
import boto3
from datetime import datetime

def analyze_step_functions_execution():
    client = boto3.client('stepfunctions', region_name='ap-northeast-1')

    execution_arn = 'arn:aws:states:ap-northeast-1:455931011903:execution:VideoGen-VideoGeneration-dev:test-execution-1749902824'

    # Get execution history
    response = client.get_execution_history(executionArn=execution_arn)

    print("=" * 80)
    print("Step Functions Execution Analysis")
    print("=" * 80)

    task_outputs = {}

    for event in response['events']:
        if event['type'] == 'TaskSucceeded':
            event_id = event['id']
            output_raw = event.get('taskSucceededEventDetails', {}).get('output')

            if output_raw:
                try:
                    output = json.loads(output_raw)
                    # Find corresponding task state entered event
                    for e in response['events']:
                        if (e['type'] == 'TaskStateEntered' and
                            e['id'] < event_id and
                            e.get('stateEnteredEventDetails')):
                            task_name = e['stateEnteredEventDetails']['name']
                            task_outputs[task_name] = output
                            break
                except json.JSONDecodeError:
                    continue

    # Print task outputs
    for task_name, output in task_outputs.items():
        print(f"\n📋 {task_name} Output:")
        print("-" * 40)
        print(json.dumps(output, indent=2, ensure_ascii=False)[:500] + "..." if len(json.dumps(output)) > 500 else json.dumps(output, indent=2, ensure_ascii=False))

    # Check for data flow issues
    print("\n🔍 Data Flow Analysis:")
    print("-" * 40)

    if 'ComposeVideoTask' in task_outputs:
        compose_output = task_outputs['ComposeVideoTask']
        print(f"ComposeVideo output keys: {list(compose_output.keys())}")

        if 'composedVideos' in compose_output:
            print(f"composedVideos count: {len(compose_output['composedVideos'])}")
        else:
            print("❌ Missing 'composedVideos' in ComposeVideo output!")

    if 'UploadToYouTubeTask' in task_outputs:
        upload_output = task_outputs['UploadToYouTubeTask']
        print(f"UploadToYouTube status: {upload_output.get('statusCode')}")
        if upload_output.get('statusCode') != 200:
            print(f"UploadToYouTube error: {upload_output.get('error')}")

if __name__ == "__main__":
    analyze_step_functions_execution()
