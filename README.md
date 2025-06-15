# PII Redaction on Amazon S3 using Object Lambda and AWS CDK

This project demonstrates how to use **Amazon S3 Object Lambda** and **AWS Lambda** to dynamically redact sensitive information (PII) such as email addresses during S3 object retrieval — without modifying the original files.

## Project Structure

```bash
s3-object-lambda-pii-redaction/
├── cdk/                  # CDK app & stack definition
│   ├── bin/
│   │   └── app.ts
│   ├── lib/
│   │   └── pii-masker-stack.ts
│   └── cdk.json
├── lambda/               # Python Lambda function for redacting PII
│   └── index.py
├── README.md
├── .gitignore
└── package.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- AWS CLI configured with sufficient permissions

### 1. Install dependencies

```bash
npm install
```

### 2. Bootstrap and deploy the CDK stack

```bash
cdk bootstrap
cdk deploy
```

This will provision:

- An S3 bucket for raw data
- An S3 Access Point
- A Python Lambda function to redact sensitive fields

## Working

Given a file(test.txt) like:

```
Hello Team,

Please reach out to our new client Alice at alice.wonderland@company.net to schedule the kickoff call. Let me know if you need anything else.

Best,
Project Manager
```

When fetched via Object Lambda, it returns:

```
Hello Team,

Please reach out to our new client Alice at [REDACTED_EMAIL] to schedule the kickoff call. Let me know if you need anything else.

Best,
Project Manager

```

### Testing via AWS CLI

```bash
# Raw object
aws s3 cp s3://raw-bucket-with-sensitive-data/logs.csv ./input/test.txt

# Redacted via Object Lambda
aws s3api get-object \
  --bucket arn:aws:s3-object-lambda:<_REGION_>:<_ACCOUNT_ID_>:accesspoint/object-lambda-access-point \
  --key logs.csv \
  ./output/test.txt

```

Replace <_REGION_> and <_ACCOUNT_ID_> with your AWS values.

## Cleanup

If you're done testing or using this in a temporary environment:

```bash
cdk destroy
```

This removes:

- The S3 bucket and objects (if autoDeleteObjects: true)
- Lambda function and associated roles
- S3 Access Point
- S3 Object Lambda Access Point
- IAM policies

```
Since we are using CDK and logRetention, the log events inside CloudWatch log groups will expire automatically after the retention period (7 days). However, the log groups themselves are not deleted by default. To clean them up completely, you can use AWS CLI / AWS Console to delete all log groups with specific project tag.
```
