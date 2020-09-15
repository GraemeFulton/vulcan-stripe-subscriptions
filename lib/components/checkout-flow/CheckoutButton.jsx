import React from 'react';
import PropTypes from 'prop-types';
import { Components, registerComponent, getSetting, withCurrentUser, withMessages } from 'meteor/vulcan:core';
import { Products } from '../../modules/products.js';
import { withRouter } from 'react-router';
import { Link } from "react-router-dom";

class CheckoutButton extends React.Component {

    constructor() {
        super();
        this.state = {
            loading: false,
            mounted: false
        };
        this.handleOpen = this.handleOpen.bind(this)
    }

    handleOpen = () => {
        this.props.history.push({
            pathname: '/checkout',
            state: {
                from: this.props.location.pathname,
                vulcanProductKey: this.props.vulcanProductKey,
                //can't pass objects via history state
                //+ not too sure associatedCollection is needed for subscriptions
                //https://5dc94d3d478e66000815d452--vulcan-docs.netlify.app/payments.html#Associating-a-Collection-Document
                associatedCollection: this.props.associatedCollection,
                associatedDocument: this.props.associatedDocument,
            }
        })
        return false;
    }


    render() {

        return (
            <>
            <button onClick={this.handleOpen} className={this.props.buttonStyles}>
                {this.props.buttonText ? this.props.buttonText : 'Buy Now'}
            </button>
            {/* Test payment complete */}
            {/* <Link 
            to={{
                pathname: "/",
                state: { intent: 'payment_complete' }
              }}>
                            <button className="bg-royalblue-500 hover:bg-royalblue-700 text-white font-medium py-3 px-5 rounded-full mt-2 text-sm">
                                Continue to Dashboard
                            </button>
                        </Link> */}
            </>
        );
    }
}


registerComponent(
    {
        name: 'CheckoutButton',
        component: CheckoutButton,
        hocs: [withRouter]
    });

