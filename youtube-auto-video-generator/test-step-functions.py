#!/usr/bin/env python3
"""
Test Step Functions Workflow - YouTube Auto Video Generation
"""
import json
import boto3
import time
from datetime import datetime

def test_step_functions_workflow():
    """Test the complete video generation workflow"""

    # Initialize Step Functions client
    stepfunctions_client = boto3.client('stepfunctions', region_name='ap-northeast-1')

    # State Machine ARN
    state_machine_arn = 'arn:aws:states:ap-northeast-1:455931011903:stateMachine:VideoGen-VideoGeneration-dev'

    # Test input for workflow
    workflow_input = {
        "spreadsheetId": "1LynUd8B4xuzmoTp5JwnBsZsAJ8M1Apbx271NyChXIo0",
        "sheetName": "Sheet1",
        "range": "A1:Z100"
    }

    print("=" * 80)
    print("Step Functions Workflow Test - YouTube Auto Video Generation")
    print("=" * 80)
    print(f"State Machine: {state_machine_arn}")
    print(f"Input: {json.dumps(workflow_input, indent=2, ensure_ascii=False)}")

    try:
        # Start execution
        execution_name = f"test-execution-{int(datetime.now().timestamp())}"
        print(f"\nStarting execution: {execution_name}")

        response = stepfunctions_client.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(workflow_input)
        )

        execution_arn = response['executionArn']
        print(f"Execution ARN: {execution_arn}")
        print("\n✅ Workflow execution started successfully!")

        # Monitor execution
        print("\n📊 Monitoring execution status...")
        print("Press Ctrl+C to stop monitoring (execution will continue)")

        try:
            while True:
                execution_response = stepfunctions_client.describe_execution(
                    executionArn=execution_arn
                )

                status = execution_response['status']
                print(f"\rStatus: {status} | Time: {datetime.now().strftime('%H:%M:%S')}", end='', flush=True)

                if status in ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED']:
                    print(f"\n\n🏁 Execution completed with status: {status}")

                    if status == 'SUCCEEDED':
                        print("✅ Workflow completed successfully!")
                        if 'output' in execution_response:
                            output = json.loads(execution_response['output'])
                            print(f"Output: {json.dumps(output, indent=2, ensure_ascii=False)}")
                    else:
                        print("❌ Workflow failed or was terminated")
                        if 'error' in execution_response:
                            print(f"Error: {execution_response['error']}")
                        if 'cause' in execution_response:
                            print(f"Cause: {execution_response['cause']}")

                    break

                time.sleep(5)  # Wait 5 seconds before checking again

        except KeyboardInterrupt:
            print(f"\n\n⏸️  Monitoring stopped. Execution continues in background.")
            print(f"Check status at: https://console.aws.amazon.com/states/home?region=ap-northeast-1#/executions/details/{execution_arn}")
            return True

    except Exception as e:
        print(f"\n❌ Error starting workflow: {str(e)}")
        return False

def get_execution_history():
    """Get execution history for debugging"""
    stepfunctions_client = boto3.client('stepfunctions', region_name='ap-northeast-1')

    # List recent executions
    response = stepfunctions_client.list_executions(
        stateMachineArn='arn:aws:states:ap-northeast-1:455931011903:stateMachine:VideoGen-VideoGeneration-dev',
        maxResults=5
    )

    print("\n📋 Recent Executions:")
    print("-" * 80)
    for execution in response['executions']:
        print(f"Name: {execution['name']}")
        print(f"Status: {execution['status']}")
        print(f"Start: {execution['startDate']}")
        if 'stopDate' in execution:
            print(f"Stop: {execution['stopDate']}")
        print("-" * 40)

if __name__ == "__main__":
    # Show recent executions first
    get_execution_history()

    # Start new execution
    test_step_functions_workflow()
