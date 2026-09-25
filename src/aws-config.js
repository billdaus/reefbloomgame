/**
 * AWS config — the reef-bloom-auth CloudFormation stack's outputs (see
 * SIGNIN.md and infra/reef-auth.yaml). Deployed Sep 24 2026, us-east-1.
 *
 * None of these values are secrets: access control lives in the Cognito
 * app client settings and the IAM policy on the identity pool role, so
 * this file is safe to commit. Set it to null to turn accounts off — the
 * game then runs exactly as before: fully local, no sign-in UI, no AWS
 * code loaded.
 */
export const awsConfig = {
  region:           'us-east-1',
  userPoolId:       'us-east-1_g9iQSfTrV',
  userPoolClientId: '7jablg1mc9r4nei51101rq5dac',
  cognitoDomain:    'https://reef-bloom.auth.us-east-1.amazoncognito.com',
  identityPoolId:   'us-east-1:f02e72f4-a481-4624-a971-64cf47df2ef3',
  saveTable:        'reef-bloom-saves',
};
