#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { PiiMaskerStack } from "../lib/pii-masker-stack";

const app = new App();
new PiiMaskerStack(app, "PiiMaskerStack", {});
