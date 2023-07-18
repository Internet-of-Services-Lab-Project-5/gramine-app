# How to Deploy This App

1. Do your changes. If you add some files or dependencies check the Dockerfile and adjust it accordingly.
2. From this package's root run `npm run gramine` to build and push the docker image and finally retrieve the mr_enclave (This will result in an error, but we just need the output of the terminal).
3. Check the terminal output from step 2 and copy the **docker checksum** and paste it in `iexec.json` as the value of `checksum`, but replace **sha:** with **0x**.
4. Check again the output from step 2 and copy the **mr_enclave** value and paste it in `iexec.json` as the value of `fingerprint`.
5. From this package's root run `npm run deploy` and enter the password (same as in `pushAppSecret.js`).
6. Copy the app address from the output of step 5 and run `npm run secret -- PASTE-APP-ADDRESS-HERE`.

TODO: Adjust again because npm run gramine has samchamani in it
