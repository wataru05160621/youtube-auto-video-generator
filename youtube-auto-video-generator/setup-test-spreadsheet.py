#!/usr/bin/env python3
"""
Setup test data in Google Spreadsheet
"""
import json
import boto3
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

def setup_test_spreadsheet():
    """Set up test data in the Google Spreadsheet"""

    print("=" * 80)
    print("Setting up test data in Google Spreadsheet")
    print("=" * 80)

    # Get Google Sheets credentials from AWS Secrets Manager
    secrets_client = boto3.client('secretsmanager', region_name='ap-northeast-1')

    try:
        secret_response = secrets_client.get_secret_value(
            SecretId='youtube-auto-video-generator/google-sheets-api'
        )
        credentials_data = json.loads(secret_response['SecretString'])
        print("✅ Retrieved Google Sheets credentials from AWS Secrets Manager")
    except Exception as e:
        print(f"❌ Failed to get credentials: {e}")
        return False

    # Initialize Google Sheets API
    try:
        credentials = Credentials.from_service_account_info(
            credentials_data,
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        service = build('sheets', 'v4', credentials=credentials)
        print("✅ Initialized Google Sheets API")
    except Exception as e:
        print(f"❌ Failed to initialize Google Sheets API: {e}")
        return False

    # Spreadsheet ID
    spreadsheet_id = '1LynUd8B4xuzmoTp5JwnBsZsAJ8M1Apbx271NyChXIo0'

    # Test data
    test_data = [
        # Header row
        ['title', 'theme', 'target_audience', 'duration', 'keywords', 'status', 'script', 'description'],
        # Test videos
        ['AI基礎入門', '人工知能の基本概念', '初心者', '3分', 'AI 機械学習 基礎', 'pending', '', ''],
        ['プログラミング入門', '初心者向けプログラミング', '学生', '5分', 'プログラミング 入門 Python', 'pending', '', ''],
        ['クラウド技術概要', 'クラウドコンピューティングの基礎', 'IT職員', '4分', 'クラウド AWS 基礎', 'pending', '', '']
    ]

    try:
        # Clear existing data
        clear_range = 'Sheet1!A:Z'
        service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=clear_range,
            body={}
        ).execute()
        print("✅ Cleared existing data")

        # Write test data
        range_name = 'Sheet1!A1:H4'
        body = {
            'values': test_data
        }

        result = service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=range_name,
            valueInputOption='RAW',
            body=body
        ).execute()

        updated_cells = result.get('updatedCells', 0)
        print(f"✅ Updated {updated_cells} cells in spreadsheet")

        # Verify the data was written
        read_result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range='Sheet1!A1:H4'
        ).execute()

        values = read_result.get('values', [])
        print(f"✅ Verification: Found {len(values)} rows of data")

        # Print the data for confirmation
        print("\n📋 Written data:")
        for i, row in enumerate(values):
            if i == 0:
                print(f"Headers: {row}")
            else:
                print(f"Row {i}: {row[0]} - {row[1]} - Status: {row[5]}")

        return True

    except Exception as e:
        print(f"❌ Failed to write test data: {e}")
        return False

if __name__ == "__main__":
    success = setup_test_spreadsheet()
    print("\n" + "=" * 80)
    if success:
        print("🎉 Test data setup completed successfully!")
        print("You can now run the full workflow test.")
    else:
        print("❌ Test data setup failed.")
    print("=" * 80)
