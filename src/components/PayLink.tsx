import React from 'react';
import { upiLink } from '../utils/settlement';
import { watchForApp } from '../utils/appLinks';

interface PayLinkProps {
    upi: string;
    payee: string;
    amount: number;
    onNoApp: (note: string) => void;
}

// PAY: opens a UPI app with the amount filled in.
const PayLink: React.FC<PayLinkProps> = ({ upi, payee, amount, onNoApp }) => (
    <a className="btn btn-success owings-pay" href={upiLink(upi, payee, amount)}
        onClick={() => watchForApp(() => onNoApp(`No UPI app found. Pay ${upi} manually.`))}>PAY</a>
);

export default PayLink;
