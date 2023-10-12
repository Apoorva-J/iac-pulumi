import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import env from 'dotenv';

env.config();

// VPC
const aws_vpc = new aws.ec2.Vpc("main", {
    cidrBlock: process.env.cidrBlock,
    //instanceTenancy: "default",
    tags: {
        Name: "main",
    },
});


// Subnets

const publicSubnets = [];
const privateSubnets = [];

const available = aws.getAvailabilityZones({
    state: "available",
});


let numAvailabilityZones=3;

// Create public and private subnets in the chosen availability zones
for (let i = 0; i < numAvailabilityZones; i++) {
    // public subnet
    const publicSubnet = new aws.ec2.Subnet(`publicSubnet${i}`, {
        vpcId: aws_vpc.id,
        cidrBlock: `10.0.0.${i * 2}.0/24`,
        availabilityZone: available.names?.[i],
        mapPublicIpOnLaunch: true,
    });
    publicSubnets.push(publicSubnet);

    // private subnet
    const privateSubnet = new aws.ec2.Subnet(`privateSubnet${i}`, {
        vpcId: aws_vpc.id,
        cidrBlock: `10.0.0.${i * 2 + 1}.0/24`,
        availabilityZone: available.names?.[i],
    });
    privateSubnets.push(privateSubnet);
}

