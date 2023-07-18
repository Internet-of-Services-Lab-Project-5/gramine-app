import { Wallet } from "ethers";
import { IExec, utils } from "iexec";

const airlineTEEApp = "0x40b786CE472cAA79744E002d49fE81d5bf6E8450";
const walletListContract = "0x864FF57CA3bd6e27cD0408893B5bFeF69A7D91A8";
const password = "1234";
const iExecWallet = {
  address: "8790ed88752255da1a08142d5ba31f0fc0b97fd4",
  id: "eb816e1c-086b-40f6-b4d1-efcde1ed5800",
  version: 3,
  crypto: {
    cipher: "aes-128-ctr",
    cipherparams: {
      iv: "a96df15e916d8b3e3e1bac7ca7e80029",
    },
    ciphertext:
      "6234d1d1f2b7043856ba835c5b983f0e1b55550fa92645a7cd294536f4cc8809",
    kdf: "scrypt",
    kdfparams: {
      salt: "e61d6399130ed128103e2cfadc2436eaa2880fdd350d3caf473e095def311286",
      n: 131072,
      dklen: 32,
      p: 1,
      r: 8,
    },
    mac: "d31d8a150e0572042b0139c1908048fd96760dd494fe3d17cfd162825b22a1b1",
  },
};
const alchemyKey = "6msOk8gqto8m3OZtn5nhjeNSnN-HCPk9";
const ethPrivateKey =
  "0x7ba7bb507739e598a318ebe53a1891e70d763cee1c22fb8ea41aa63b744bd45f";
const secret = JSON.stringify({
  iExecWallet,
  password,
  airlineTEEApp,
  walletListContract,
  alchemyKey,
  ethPrivateKey,
});

if (process.argv.length < 3) {
  console.log("No app address provided");
  process.exit(1);
}

const appAddress = process.argv[2];

const testData = [
  { firstname: "Gussy", lastname: "Preshaw", birthdate: "07/07/1967" },
  { firstname: "Sam", lastname: "Chamani", birthdate: "26/06/1995" },
  { firstname: "Nara", lastname: "Blenkinship", birthdate: "29/12/1953" },
  { firstname: "Aurelia", lastname: "Kusumastuti", birthdate: "31/07/2000" },
];

(async () => {
  const { privateKey } = await Wallet.fromEncryptedJson(
    JSON.stringify(iExecWallet),
    password
  );
  const signer = utils.getSignerFromPrivateKey("bellecour", privateKey);
  const iexec = new IExec({ ethProvider: signer });

  const hasDevSecret = await iexec.app.checkAppSecretExists(appAddress, {
    teeFramework: "gramine",
  });
  if (!hasDevSecret) {
    await iexec.app.pushAppSecret(appAddress, secret, {
      teeFramework: "gramine",
    });
  }

  const isSet = await iexec.secrets.checkRequesterSecretExists(
    "0x8790ed88752255da1a08142d5ba31f0fc0b97fd4",
    "testSecret10",
    { teeFramework: "gramine" }
  );
  if (!isSet) {
    await iexec.secrets.pushRequesterSecret(
      "testSecret10",
      JSON.stringify(testData),
      {
        teeFramework: "gramine",
      }
    );
  }
})();
