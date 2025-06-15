import os
import re
import boto3
from urllib.parse import urlparse

s3 = boto3.client("s3")

EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9.+_-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+")

def lambda_handler(event, context):
    # Determine the requested key
    requested_url = event["userRequest"]["url"]
    key = urlparse(requested_url).path.lstrip("/")

    # Fetch the raw object
    bucket = os.environ["RAW_BUCKET_NAME"]
    resp = s3.get_object(Bucket=bucket, Key=key)
    body = resp["Body"].read()

    # Only redact emails in .txt files
    if key.lower().endswith(".txt"):
        try:
            text = body.decode("utf-8")
            redacted = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", text)
            output = redacted.encode("utf-8")
            print(f"Redacted emails in {key}")
        except Exception:
            output = body
    else:
        output = body

    # Return to the caller
    s3.write_get_object_response(
        Body=output,
        RequestRoute=event["getObjectContext"]["outputRoute"],
        RequestToken=event["getObjectContext"]["outputToken"],
    )
    return {"status_code": 200}
