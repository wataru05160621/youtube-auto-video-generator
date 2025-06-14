#!/usr/bin/env python3
"""
Simple Step Functions analysis - focus on each step's input and output
"""
import json
import boto3

def simple_analysis():
    client = boto3.client('stepfunctions', region_name='ap-northeast-1')

    execution_arn = 'arn:aws:states:ap-northeast-1:455931011903:execution:VideoGen-VideoGeneration-dev:test-execution-1749902824'

    response = client.get_execution_history(executionArn=execution_arn)

    print("Step Functions Workflow Analysis")
    print("=" * 50)

    step_count = 0
    for event in response['events']:
        if event['type'] == 'TaskStateEntered':
            step_count += 1
            step_name = event.get('stateEnteredEventDetails', {}).get('name', 'Unknown')
            print(f"\n{step_count}. {step_name}")
            print("-" * 30)

            # Find the corresponding TaskSucceeded event
            for next_event in response['events']:
                if (next_event['type'] == 'TaskSucceeded' and
                    next_event['id'] > event['id'] and
                    next_event['id'] < event['id'] + 10):  # Should be close

                    output_raw = next_event.get('taskSucceededEventDetails', {}).get('output')
                    if output_raw:
                        try:
                            output = json.loads(output_raw)
                            payload = output.get('Payload', {})
                            status = payload.get('statusCode', 'Unknown')

                            print(f"Status: {status}")

                            if status == 200:
                                # Show relevant data
                                if 'videosToProcess' in payload:
                                    print(f"Videos to process: {len(payload['videosToProcess'])}")
                                elif 'processedVideos' in payload:
                                    print(f"Processed videos: {len(payload['processedVideos'])}")
                                elif 'composedVideos' in payload:
                                    print(f"Composed videos: {len(payload['composedVideos'])}")
                                elif 'uploadResults' in payload:
                                    print(f"Upload results: {len(payload['uploadResults'])}")
                            else:
                                print(f"Error: {payload.get('error', 'Unknown error')}")

                        except json.JSONDecodeError:
                            print("Could not parse output")
                    break

if __name__ == "__main__":
    simple_analysis()
