import { useEffect, useState } from "react";
import styled from "styled-components";
import Countdown from "react-countdown";
import { Button, CircularProgress, Snackbar } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";

import * as anchor from "@project-serum/anchor";

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";

import {
  CandyMachine,
  awaitTransactionSignatureConfirmation,
  getCandyMachineState,
  mintOneToken,
  shortenAddress,
} from "./candy-machine";

const ConnectButton = styled(WalletDialogButton)``;

const CounterText = styled.span``; // add your styles here

const MintContainer = styled.div``; // add your styles here

const MintButton = styled(Button)``; // add your styles here

export interface HomeProps {
  candyMachineId: anchor.web3.PublicKey;
  config: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  treasury: anchor.web3.PublicKey;
  txTimeout: number;
}

const Home = (props: HomeProps) => {
  const [balance, setBalance] = useState<number>();
  const [isActive, setIsActive] = useState(false); // true when countdown completes
  const [isSoldOut, setIsSoldOut] = useState(false); // true when items remaining is zero
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [counter, setCounter] = useState<any>({});
  const [price, setPrice] = useState<number | null>(null);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const [startDate, setStartDate] = useState(new Date(props.startDate));

  const wallet = useAnchorWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();


  const WalletCheck = (pubkey: string) => {
    console.log(pubkey)
    let data = {walletid:pubkey};
    fetch("https://solspecterwalletapi.azurewebsites.net/api/walletcheck",
    {
      method: "POST",
      body: JSON.stringify(data)
    }).then(res =>{
      console.log("Status: ", res);
      if (res.status == 200){
        onMint(true)
      } else {
        setAlertState({
          open: true,
          message: "This wallet currently does not have any remaining mints. Please try again on the official launch date or contact the devs in discord for help.",
          severity: "error",
        });
      }
    });
  };

  const onMint = async (authed:boolean) => {
    try {
      setIsMinting(true);
      if (wallet && candyMachine?.program) {
        if (authed){
          const mintTxId = await mintOneToken(
            candyMachine,
            props.config,
            wallet.publicKey,
            props.treasury
          );
  
          const status = await awaitTransactionSignatureConfirmation(
            mintTxId,
            props.txTimeout,
            props.connection,
            "singleGossip",
            false
          );
  
          if (!status?.err) {
            FinalizePurchase(String(wallet.publicKey))
            setAlertState({
              open: true,
              message: "Congratulations! Mint succeeded!",
              severity: "success",
            });
          } else {
            setAlertState({
              open: true,
              message: "Mint failed! Please try again!",
              severity: "error",
            });
          }
        } else {
          setAlertState({
            open: true,
            message: "This wallet currently does not have any remaining mints. Please try again on the official launch date, or contact the devs in discord for help.",
            severity: "error",
          });
        }
      }
    } catch (error: any) {
      // TODO: blech:
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
          setIsSoldOut(true);
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
      setIsMinting(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, props.connection]);

  useEffect(() => {
    (async () => {
      if (!wallet) return;

      const { candyMachine, goLiveDate, itemsRemaining, itemsAvailable, price } =
        await getCandyMachineState(
          wallet as anchor.Wallet,
          props.candyMachineId,
          props.connection
        );

      setIsSoldOut(itemsRemaining === 0);
      setStartDate(goLiveDate);
      setCandyMachine(candyMachine);
      setCounter({
        itemsRemaining,
        itemsAvailable
      });
      setPrice(price)
    })();
  }, [wallet, props.candyMachineId, props.connection]);

  return (
    <main>
      {wallet && (
        <p>Address: {shortenAddress(wallet.publicKey.toBase58() || "")}</p>
      )}

      {wallet && (
        <p>Balance: {(balance || 0).toLocaleString()} SOL</p>
      )}

      {!!counter && (
        <>
          Items available: {counter.itemsRemaining} / {counter.itemsAvailable}
          <br />
          <br />
          <br />
          <br />
        </>
      )}

      <MintContainer>
        {!wallet ? (
          <ConnectButton>Connect Wallet</ConnectButton>
        ) : (
          <MintButton
            disabled={isSoldOut || isMinting || !isActive}
            onClick={() => {WalletCheck(String(wallet.publicKey))}}
            variant="contained"
          >
            {isSoldOut ? (
              "SOLD OUT"
            ) : isActive ? (
              isMinting ? (
                <CircularProgress />
              ) : (
                `MINT FOR ${price} SOL ⛏`
              )
            ) : (
              <Countdown
                date={startDate}
                onMount={({ completed }) => completed && setIsActive(true)}
                onComplete={() => setIsActive(true)}
                renderer={renderCounter}
              />
            )}
          </MintButton>
        )}
      </MintContainer>

      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
    </main>
  );
};

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

const renderCounter = ({ days, hours, minutes, seconds, completed }: any) => {
  return (
    <CounterText>
      {hours} hours, {minutes} minutes, {seconds} seconds
    </CounterText>
  );
};

function FinalizePurchase(pubkey: string) {
  let data = {walletid:pubkey};
  fetch("https://solspecterwalletapi.azurewebsites.net/api/purchasecomplete",
  {
    method: "POST",
    body: JSON.stringify(data)
  }).then(res =>{
    console.log("Reciept: ", res);
    return true
  });
  return false
};

export default Home;
