# AWS IAM Viewer

A Flask web application that allows you to upload and analyze AWS IAM account-authorization-details.json files to better understand your AWS IAM configuration.

## Features

- Upload and parse AWS IAM account-authorization-details.json files
- View comprehensive information about IAM users, roles, policies, and groups
- Explore relationships between IAM entities
- See which roles a user can assume
- View policy documents and trust relationships
- Search and filter IAM resources

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/kabinet01/aws_iam_viewer
   cd aws-iam-viewer
   ```

2. Create a virtual environment and activate it:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

4. Run the application:
   ```
   python app.py
   ```

5. Open your browser and navigate to `http://127.0.0.1:5000`

## How to Get Your AWS IAM Authorization Details

1. Install and configure the AWS CLI with appropriate credentials
2. Run the following command:
   ```
   aws iam get-account-authorization-details --output json > account-authorization-details.json
   ```
3. Upload the generated file using the web interface

## Security Note

All processing is done locally in your browser. Your AWS data is not sent to any external servers.