/**
 * AWS config — paste the CloudFormation stack outputs here to enable
 * sign-in and cloud sync. Setup is one command; see SIGNIN.md.
 *
 * None of these values are secrets: access control lives in the Cognito
 * app client settings and the IAM policy on the identity pool role, so
 * this file is safe to commit.
 *
 * While this is null, the game runs exactly as before: fully local,
 * no sign-in UI shown, no AWS code loaded.
 *
 * Shape:
 * export const awsConfig = {
 *   region:           'us-east-1',
 *   userPoolId:       'us-east-1_XXXXXXXXX',
 *   userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   cognitoDomain:    'https://<prefix>.auth.us-east-1.amazoncognito.com',
 *   identityPoolId:   'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
 *   saveTable:        'reef-bloom-saves',
 * };
 */
export const awsConfig = null;
