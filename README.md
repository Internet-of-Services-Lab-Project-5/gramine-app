# Gramine app

This is the repository for the TEE app that runs on the node server's request and starts the scone apps with the newest datasets. The datasets are pulled from the wallet addresses.

## How to Deploy This App

1. Do your changes. If you add some files or dependencies check the Dockerfile and adjust it accordingly.
2. In the scripts of `package.json` change `samchamani` to your docker user name. Make sure your docker daemon is running.
3. From this package's root run `npm run gramine` to build and push the docker image and finally retrieve the mr_enclave (This will result in an error, but we just need the output of the terminal).
4. Check the terminal output from step 2 and copy the **docker checksum** and paste it in `iexec.json` as the value of `checksum`, but replace **sha:** with **0x**.
5. Check again the output from step 2 and copy the **mr_enclave** value and paste it in `iexec.json` as the value of `fingerprint`.
6. From this package's root run `npm run deploy` and enter the password (same as in `pushAppSecret.js`).
7. Copy the app address from the output of step 5, adjust the secrets in `pushAppSecret.js` if needed, and run `npm run secret -- PASTE-APP-ADDRESS-HERE`.
