# Private S3 media storage

GeoSentri stores new officer profile photos and report evidence in one private
Amazon S3 bucket. Existing `/uploads/...` database values remain supported so
the migration does not break old images.

## Data flow

1. Web or mobile submits one JPEG, PNG, or WebP image to the Express API.
2. Multer holds at most 5 MB in memory and the backend verifies the file's magic
   signature rather than trusting only its extension or reported MIME type.
3. The backend uploads the validated buffer under a UUID object key in either
   `profile-photos/` or `report-evidence/`.
4. MongoDB stores the private `s3://bucket/key` reference, not AWS credentials or
   a permanently accessible URL.
5. API and Socket.IO serializers issue a backend-signed link that expires after
   15 minutes. The media route validates the signature and redirects to a
   one-minute S3 presigned GET URL.

The bucket must retain **Block all public access**, **ACLs disabled / Bucket
owner enforced**, and **SSE-S3** default encryption.

## Backend environment

Configure these only in `backend/.env` locally and in Hostinger's secret
environment variables in production:

```dotenv
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=<private-bucket-name>
AWS_ACCESS_KEY_ID=<dedicated-IAM-access-key>
AWS_SECRET_ACCESS_KEY=<dedicated-IAM-secret-key>
S3_SIGNED_URL_TTL_SECONDS=900
MEDIA_URL_SIGNING_SECRET=<separate-long-random-secret>
```

Never use root credentials, expose these values through Vite/Expo variables, or
commit `.env`. The IAM identity should have access only to the two media
prefixes. If none of the AWS variables are present, development falls back to
the existing local `backend/uploads` storage. A partial AWS configuration fails
closed with a service configuration error.

## Permission verification

Run the temporary live check after configuring the environment:

```sh
npm run test:s3 --prefix backend
```

It uploads one 1x1 PNG into `profile-photos/`, downloads and compares it, then
deletes it in a `finally` cleanup. It does not print credentials.

## Deployment and rotation

- Copy the six media variables into Hostinger before deploying the S3-enabled
  backend.
- After deployment, upload a new profile photo and submit one report evidence
  photo from a real mobile build, then verify both web and mobile viewing.
- To rotate credentials, create a second key for `geosentri-backend-s3`, update
  local and Hostinger secrets, redeploy/test, then deactivate and delete the old
  key.
- Do not automatically expire report evidence without an approved police data
  retention policy. Replaced profile-photo objects are deleted by the backend.
