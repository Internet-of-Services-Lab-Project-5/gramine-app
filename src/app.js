import { IExec, utils } from "iexec";
import { Wallet, Contract, AlchemyProvider } from "ethers";
import * as fs from "fs";
import AdmZip from "adm-zip";
import fetch from "node-fetch";

/* -------------------------------------------------------------------------- */
/*                            GET DATA FROM SECRETS                           */
/* -------------------------------------------------------------------------- */

const { IEXEC_APP_DEVELOPER_SECRET, IEXEC_REQUESTER_SECRET_1, IEXEC_OUT } =
  process.env;
const {
  iExecWallet,
  password,
  airlineTEEApp,
  walletListContract,
  alchemyKey,
  ethPrivateKey,
} = JSON.parse(IEXEC_APP_DEVELOPER_SECRET);
console.log("Got secret data from environment variables.");

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const category = 0;
const abi = getABI();
const tag = ["tee", "scone"];
const teeFramework = "scone";
const host = "bellecour";
const smsURL = "https://sms.scone-debug.v8-bellecour.iex.ec";
const workerpool = "debug-v8-bellecour.main.pools.iexec.eth";

/* -------------------------------------------------------------------------- */
/*                       SETUP SMART CONTRACT CONNECTION                      */
/* -------------------------------------------------------------------------- */

const alchemyProvider = new AlchemyProvider("sepolia", alchemyKey);
const ethWallet = new Wallet(ethPrivateKey, alchemyProvider);
const contract = new Contract(walletListContract, abi, ethWallet);
console.log("Connected to smart contract.");

(async () => {
  try {
    /* -------------------------------------------------------------------------- */
    /*                              INITIALIZE IEXEC                              */
    /* -------------------------------------------------------------------------- */

    const { privateKey } = await Wallet.fromEncryptedJson(
      JSON.stringify(iExecWallet),
      password
    );
    const signer = utils.getSignerFromPrivateKey(host, privateKey);
    const iexec = new IExec({ ethProvider: signer }, { smsURL });
    console.log("Initialized iExec.");

    /* -------------------------------------------------------------------------- */
    /*                            GET DATASET ADDRESSES                           */
    /* -------------------------------------------------------------------------- */

    const airlineCount = await contract.airlineCount();
    const datasets = [];
    for (let i = 0; i < airlineCount; i++) {
      const airline = await contract.airlines(i);
      const airlineAddress = airline[2];
      const datasetCount = await iexec.dataset.countUserDatasets(
        airlineAddress
      );
      const datasetData = await iexec.dataset.showUserDataset(
        datasetCount - 1,
        airlineAddress
      );
      if (datasetData.objAddress) datasets.push(datasetData.objAddress);
    }
    console.log("Will check the following datasets:\n", datasets);

    /* -------------------------------------------------------------------------- */
    /*                        MAKING DEALS FOR EACH DATASET                       */
    /* -------------------------------------------------------------------------- */

    const deals = [];
    for (const dataset of datasets) {
      /* ----------------------------------- APP ---------------------------------- */
      const appOrderToSign = await iexec.order.createApporder({
        app: airlineTEEApp,
        volume: 1,
        tag,
      });
      const appOrder = await iexec.order.signApporder(appOrderToSign, {
        preflightCheck: false,
      });

      /* ------------------------------- DATASET ------------------------------- */
      const { orders } = await iexec.orderbook.fetchDatasetOrderbook(dataset);
      const datasetOrder = orders[0].order;

      /* ------------------------------ WORKERPOOL ------------------------------ */
      const { orders: workerpoolOrders } =
        await iexec.orderbook.fetchWorkerpoolOrderbook({
          category,
          workerpool,
          minTag: tag,
          maxTag: tag,
        });
      const workerpoolOrder =
        workerpoolOrders && workerpoolOrders[0] && workerpoolOrders[0].order;
      if (!workerpoolOrder)
        throw Error(`no workerpoolorder found for category ${category}`);

      /* --------------------------------- SECRETS -------------------------------- */
      const key = generateKey(10);
      const value = IEXEC_REQUESTER_SECRET_1;
      await iexec.secrets.pushRequesterSecret(key, value, { teeFramework });

      /* ------------------------------- REQUEST ------------------------------- */
      const userAddress = await iexec.wallet.getAddress();
      const requestOrderToSign = await iexec.order.createRequestorder({
        app: airlineTEEApp,
        appmaxprice: appOrder.appprice,
        dataset,
        workerpoolmaxprice: workerpoolOrder.workerpoolprice,
        requester: userAddress,
        volume: 1,
        tag,
        params: {
          iexec_secrets: { 1: key },
          iexec_result_storage_provider: "ipfs",
          iexec_result_storage_proxy: "https://result.v8-bellecour.iex.ec",
        },
        category,
      });
      const requestOrder = await iexec.order.signRequestorder(
        requestOrderToSign,
        {
          preflightCheck: false,
        }
      );

      /* ---------------------------------- DEAL ---------------------------------- */
      const { dealid, volume } = await iexec.order.matchOrders(
        {
          apporder: appOrder,
          datasetorder: datasetOrder,
          requestorder: requestOrder,
          workerpoolorder: workerpoolOrder,
        },
        { preflightCheck: false }
      );
      deals.push(dealid);
      console.log(`Deal ${dealid} created for dataset ${dataset}`, volume);
    }

    /* -------------------------------------------------------------------------- */
    /*                              CHECK DEAL STATUS                             */
    /* -------------------------------------------------------------------------- */

    let completedDeals = 0;
    await reportProgress(0, deals.length);
    for (const deal of deals) {
      const observable = await iexec.deal.obsDeal(deal);
      observable.subscribe({
        next: (value) => console.log(value),
        error: (error) => console.log(error),
        complete: () => {
          completedDeals++;
          reportProgress(completedDeals, deals.length);
          console.log(`Deal ${deal} completed.`);
          if (completedDeals === deals.length) {
            console.log(`All ${completedDeals} deals completed.`);
            (async () => {
              /* -------------------------------------------------------------------------- */
              /*                         FETCH AND PROCESS RESULTS                          */
              /* -------------------------------------------------------------------------- */

              let allResults = [];
              for (const completedDeal of deals) {
                const taskId = await iexec.deal.computeTaskId(completedDeal, 0);
                const response = await iexec.task.fetchResults(taskId);
                const file = await response.blob();
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const zip = new AdmZip(buffer);
                const resultText = zip
                  .getEntry("result.txt")
                  ?.getData()
                  .toString();
                const results = resultText?.split("\n");
                allResults = [...allResults, ...results];
              }
              const uniqueResults = allResults.filter(
                (v, i, a) => a.indexOf(v) === i
              );
              console.log("Fetched and processed the results", uniqueResults);

              /* -------------------------------------------------------------------------- */
              /*                                 SAVE RESULT                                */
              /* -------------------------------------------------------------------------- */

              await fs.promises.writeFile(
                `${IEXEC_OUT}/result.txt`,
                uniqueResults.join("\n")
              );
              const computedJsonObj = {
                "deterministic-output-path": `${IEXEC_OUT}/result.txt`,
              };
              await fs.promises.writeFile(
                `${IEXEC_OUT}/computed.json`,
                JSON.stringify(computedJsonObj)
              );
              console.log("Saved the result");
            })();
          }
        },
      });
    }
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();

async function reportProgress(tasksDone, tasksCount) {
  if (!process.env.IEXEC_REQUESTER_SECRET_2) return;
  const { reportAddress, statusKey, apiKey } = JSON.parse(
    process.env.IEXEC_REQUESTER_SECRET_2
  );
  if (!reportAddress || !statusKey || !apiKey) return;
  try {
    await fetch(reportAddress, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statusKey,
        apiKey,
        tasksDone,
        tasksCount,
      }),
    });
  } catch (e) {
    console.log(e);
  }
}

function generateKey(length) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

function getABI() {
  return [
    {
      inputs: [
        {
          internalType: "address",
          name: "_coordinator",
          type: "address",
        },
        {
          components: [
            {
              internalType: "string",
              name: "name",
              type: "string",
            },
            {
              internalType: "address",
              name: "wallet",
              type: "address",
            },
            {
              internalType: "address",
              name: "iExecAddress",
              type: "address",
            },
          ],
          internalType: "struct AirlineWalletListManager.Airline[]",
          name: "_airlines",
          type: "tuple[]",
        },
      ],
      stateMutability: "nonpayable",
      type: "constructor",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "string",
          name: "name",
          type: "string",
        },
      ],
      name: "AirlineAdded",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "string",
          name: "name",
          type: "string",
        },
      ],
      name: "AirlineProposed",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "string",
          name: "name",
          type: "string",
        },
      ],
      name: "AirlineRejected",
      type: "event",
    },
    {
      inputs: [],
      name: "airlineCount",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      name: "airlines",
      outputs: [
        {
          internalType: "string",
          name: "name",
          type: "string",
        },
        {
          internalType: "address",
          name: "wallet",
          type: "address",
        },
        {
          internalType: "address",
          name: "iExecAddress",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "candidate",
      outputs: [
        {
          components: [
            {
              internalType: "string",
              name: "name",
              type: "string",
            },
            {
              internalType: "address",
              name: "wallet",
              type: "address",
            },
            {
              internalType: "address",
              name: "iExecAddress",
              type: "address",
            },
          ],
          internalType: "struct AirlineWalletListManager.Airline",
          name: "airline",
          type: "tuple",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "coordinator",
      outputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "defaultCandidate",
      outputs: [
        {
          components: [
            {
              internalType: "string",
              name: "name",
              type: "string",
            },
            {
              internalType: "address",
              name: "wallet",
              type: "address",
            },
            {
              internalType: "address",
              name: "iExecAddress",
              type: "address",
            },
          ],
          internalType: "struct AirlineWalletListManager.Airline",
          name: "airline",
          type: "tuple",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "isVoting",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "owner",
      outputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "string",
          name: "name",
          type: "string",
        },
        {
          internalType: "address",
          name: "wallet",
          type: "address",
        },
        {
          internalType: "address",
          name: "iExecAddress",
          type: "address",
        },
      ],
      name: "propose",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bool",
          name: "saysYes",
          type: "bool",
        },
      ],
      name: "vote",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];
}
