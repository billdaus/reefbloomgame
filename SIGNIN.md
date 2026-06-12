# Reef Bloom — Sign-in & Cloud Sync (AWS)

Optional sign-in that syncs the three save slots across devices. The backend
is **entirely AWS** and serverless: Cognito User Pool (hosted email/password
sign-in page, sign-up and verification included), Cognito Identity Pool
(temporary AWS credentials issued straight to the browser), and DynamoDB
on-demand. No servers, no Lambda, no third-party services.

The game is fully playable signed out; until the config is pasted in, no
sign-in UI appears and no AWS code loads — the game behaves exactly as before.

## Cost

- **Cognito User Pool:** free for the first 10,000 monthly active users.
- **Cognito Identity Pool:** free.
- **DynamoDB (on-demand):** ~$1.25 per *million* writes; one item per player,
  a few KB each, writes debounced to at most one per slot per 4 seconds of
  active play. At current scale this rounds to $0.
- **IAM/CloudFormation:** free.

## What it does

- "☁️ Sign in to sync your reefs" on the Choose Your Reef screen → Cognito's
  hosted sign-in page (create account / sign in with email) → redirected back.
- All three save slots sync to one DynamoDB item per player, keyed by their
  Cognito identity id. The IAM policy (`dynamodb:LeadingKeys`) means a player's
  browser credentials physically cannot read or write anyone else's item.
- Conflict resolution is per-slot, newest-wins, via the `savedAt` timestamp on
  every save. Erasing a slot writes a tombstone so deletions propagate.
- Saves push automatically while playing (debounced 4s, flushed when the tab
  hides). Signing in on a new device pulls your reefs down.

## Enable it (one command + one paste)

1. Deploy the backend (uses your existing AWS credentials):

   ```bash
   aws cloudformation deploy \
     --template-file infra/reef-auth.yaml \
     --stack-name reef-bloom-auth \
     --capabilities CAPABILITY_NAMED_IAM
   ```

   If the hosted-UI domain prefix `reef-bloom` is taken in your region, add
   `--parameter-overrides DomainPrefix=reef-bloom-<something>`.

2. Read the outputs:

   ```bash
   aws cloudformation describe-stacks --stack-name reef-bloom-auth \
     --query 'Stacks[0].Outputs' --output table
   ```

3. Paste them into `src/aws-config.js` replacing `null`:

   ```js
   export const awsConfig = {
     region:           '<Region>',
     userPoolId:       '<UserPoolId>',
     userPoolClientId: '<UserPoolClientId>',
     cognitoDomain:    '<CognitoDomain>',
     identityPoolId:   '<IdentityPoolId>',
     saveTable:        '<SaveTable>',
   };
   ```

4. Commit and push. These values are identifiers, not secrets — access
   control lives in the app client's allowed callback URLs and the IAM policy.

## Notes

- **iOS app:** redirect auth needs native plumbing inside the Capacitor
  shell, so the sign-in row is hidden there for now.
- Each slot is stored as a raw JSON string attribute (`s0`–`s2`) on the
  player's item, plus `updatedAt`.
- The hosted UI page is plain but functional; it can be themed from the
  Cognito console (Branding) later, and a custom domain (auth.reefbloomgame.com)
  can replace the amazoncognito.com one if wanted.
- Allowed sign-in redirect URLs are baked into the template: the production
  site (root and /mobile/) and localhost:5173 for development.
