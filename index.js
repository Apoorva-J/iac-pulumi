import * as aws from "@pulumi/aws";
import env from 'dotenv';

env.config();

// VPC
const main = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
    //instanceTenancy: "default",
    tags: {
        Name: "main",
    },
});
