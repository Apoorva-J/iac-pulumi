# iac-pulumi

## INTRODUCTION

This configuration creates a set of VPC resources in Dev and Demo environments.

## STEPS TO RUN PULUMI

1. Initialize Pulumi for the project:

2. Deploy the resources with Pulumi:

3. To destroy the resources, use:

## REQUIREMENTS  

- Pulumi >= 0.12.26
- AWS provider >= 3.15

## PROVIDERS

- AWS provider >= 3.15

## MODULES

- vpc_cidr_block
- vpc_name
- vpc_internet_gateway_name
- vpc_public_subnet_name
- vpc_public_rt_name

## RESOURCES 

- aws_vpc
- aws_internet_gateway
- aws_subnet
- aws_route_table
- aws_route_table_association

## AWS Custom VPC Creation Steps:

Here is a step-by-step guide on creating a custom VPC infrastructure:

1. Select the region where you want to create the VPC.

2. Create a Virtual Private Cloud (VPC) with an appropriate CIDR block.

3. Enable DNS hostnames for the VPC.

4. Create an Internet Gateway resource.

5. Attach the Internet Gateway to the VPC.

6. Create three public subnets, one in each availability zone within the same region and VPC.

7. Enable the "Auto-assign public IP" setting for each public subnet.

8. Create a public route table.

9. Add a public route to the public route table with a destination CIDR block of 0.0.0.0/0 and the Internet Gateway as the target.

10. Associate the public subnets with the public route table.

11. Create three private subnets, one in each availability zone within the same region and VPC.

12. Create a private route table.

13. Add a route to the private route table for the desired destinations.

14. Associate the private subnets with the private route table.
