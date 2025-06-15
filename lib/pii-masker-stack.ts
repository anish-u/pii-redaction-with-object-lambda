import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket, CfnAccessPoint as CfnS3AccessPoint } from "aws-cdk-lib/aws-s3";
import { CfnAccessPoint as CfnS3ObjectLambdaAccessPoint } from "aws-cdk-lib/aws-s3objectlambda";
import { Construct } from "constructs";

export class PiiMaskerStack extends Stack {
  // Constants for resource naming
  private readonly RAW_DATA_BUCKET_NAME = "raw-bucket-with-sensitive-data";
  private readonly S3_ACCESS_POINT_NAME = "bucket-access-point";
  private readonly OBJECT_LAMBDA_ACCESS_POINT_NAME =
    "object-lambda-access-point";
  private readonly PII_MASKER_LAMBDA_NAME = "maskerLambdaFunction";

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1. Create an S3 bucket to hold raw data (text files with PII)
    const rawDataBucket = this.createS3RawDataBucket();

    // 2. Create a standard S3 Access Point to allow controlled access to the raw bucket
    const s3AccessPointArn = this.createS3AccessPointForRawBucket(
      this.S3_ACCESS_POINT_NAME,
      rawDataBucket
    );

    // 3. Create a Lambda function to mask sensitive data on the fly
    const piiMaskerLambda =
      this.createLambdaFunctionForPiiMasking(rawDataBucket);

    // 4. Grant the Lambda permission to read data from the S3 Access Point
    this.grantLambdaReadAccessToS3AccessPoint(
      piiMaskerLambda,
      rawDataBucket,
      s3AccessPointArn
    );

    // 5. Create an Object Lambda Access Point that routes S3 GET requests through the Lambda
    const objectLambdaAccessPointArn =
      this.createS3ObjectLambdaAccessPointForMasking(
        this.OBJECT_LAMBDA_ACCESS_POINT_NAME,
        piiMaskerLambda,
        s3AccessPointArn
      );

    // 6. Add permissions for Object Lambda to invoke the Lambda and return transformed content
    this.addInvokeAndWritePermissionsToObjectLambda(
      piiMaskerLambda,
      objectLambdaAccessPointArn
    );
  }

  /**
   * Create a bucket intended for storing sensitive logs or files.
   * autoDeleteObjects and removalPolicy allow cleanup during stack destroy.
   */
  private createS3RawDataBucket(): Bucket {
    return new Bucket(this, "RawDataBucket", {
      bucketName: this.RAW_DATA_BUCKET_NAME,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  /**
   * Set up an S3 Access Point to use as a backing source for the Object Lambda Access Point.
   * Returns the ARN of the access point.
   */
  private createS3AccessPointForRawBucket(
    accessPointName: string,
    bucket: Bucket
  ): string {
    new CfnS3AccessPoint(this, "S3AccessPoint", {
      bucket: bucket.bucketName,
      name: accessPointName,
    });

    return `arn:aws:s3:${this.region}:${this.account}:accesspoint/${accessPointName}`;
  }

  /**
   * Defines the Lambda function that will be invoked by Object Lambda to mask/redact data.
   */
  private createLambdaFunctionForPiiMasking(bucket: Bucket): Function {
    return new Function(this, "PiiMaskerLambda", {
      runtime: Runtime.PYTHON_3_9,
      functionName: this.PII_MASKER_LAMBDA_NAME,
      code: Code.fromAsset("lambda"),
      handler: "index.lambda_handler",
      environment: {
        RAW_BUCKET_NAME: bucket.bucketName,
      },
      logRetention: RetentionDays.ONE_WEEK,
    });
  }

  /**
   * Grants the Lambda read access to S3 objects via the access point, allowing it to fetch data.
   */
  private grantLambdaReadAccessToS3AccessPoint(
    lambdaFn: Function,
    bucket: Bucket,
    s3AccessPointArn: string
  ): void {
    // Grant read-level permissions on the bucket
    bucket.grantRead(lambdaFn);

    // Explicitly allow GetObject on the access point
    lambdaFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${s3AccessPointArn}/object/*`],
      })
    );
  }

  /**
   * Configures an Object Lambda Access Point which invokes the Lambda
   * during object retrieval, transforming the output.
   */
  private createS3ObjectLambdaAccessPointForMasking(
    accessPointName: string,
    lambdaFn: Function,
    supportingAccessPointArn: string
  ): string {
    new CfnS3ObjectLambdaAccessPoint(this, "S3ObjectLambdaAccessPoint", {
      name: accessPointName,
      objectLambdaConfiguration: {
        supportingAccessPoint: supportingAccessPointArn,
        transformationConfigurations: [
          {
            actions: ["GetObject"],
            contentTransformation: {
              AwsLambda: {
                FunctionArn: lambdaFn.functionArn,
              },
            },
          },
        ],
      },
    });

    return `arn:aws:s3-object-lambda:${this.region}:${this.account}:accesspoint/${accessPointName}`;
  }

  /**
   * Grants necessary permissions for S3 Object Lambda to invoke the masking Lambda.
   */
  private addInvokeAndWritePermissionsToObjectLambda(
    lambdaFn: Function,
    objectLambdaAccessPointArn: string
  ): void {
    // Allow the S3 Object Lambda service to invoke the Lambda function
    lambdaFn.addPermission("AllowObjectLambdaInvoke", {
      principal: new ServicePrincipal("s3-object-lambda.amazonaws.com"),
      sourceArn: objectLambdaAccessPointArn,
    });

    // Allow Lambda to return a transformed version of the object
    lambdaFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3-object-lambda:WriteGetObjectResponse"],
        resources: [objectLambdaAccessPointArn],
      })
    );
  }
}
