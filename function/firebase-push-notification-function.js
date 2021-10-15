var admin = require("firebase-admin");

export default async function(action) {
    var serviceAccount = {
        type: "service_account",
        project_id: process.env.PROJECT_ID,
        private_key_id: process.env.PRIVATE_KEY_ID,
        private_key:process.env.PRIVATE_KEY,
        client_email: process.env.CLIENT_EMAIL,
        client_id: process.env.CLIENT_ID,
        auth_uri: process.env.AUTH_URI,
        token_uri: process.env.TOKEN_URI,
        auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.CLIENT_X509_CERT_URL
    };
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.DATABASE_URL
        });
    }
    if (action.document.token) {
        var message = {
            notification: {
                title: action.document.title,
                body: action.document.body
                // image: action.document.image
            },
            token: action.document.token
        };
    }
    if (action.document.topic) {
        var message = {
            notification: {
                title: action.document.title,
                body: action.document.body
            },
            topic: action.document.topic
        };
    }
    if (action.document.tag) {
        message["android"] = {
            notification: {
                tag: action.document.tag
            }
        };
    }
    if (action.document.data) message["data"] = JSON.parse(action.document.data);
    admin
        .messaging()
        .send(message)
        .then(response => {
            console.log("Successfully sent message:", response);
        })
        .catch(error => {
            console.log("Error sending message:", error);
        });
}
