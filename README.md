
# PayWise AI 💳

### AI-Powered Payment Follow-Up and Cash-Flow Assistant

PayWise AI is an intelligent payment management application designed to help freelancers, small businesses, and service providers manage invoices, track payments, and reduce payment delays.

It combines PayPal Sandbox integration with Generative AI to simplify payment collection and improve cash-flow management.

## 🚀 Problem Statement

Freelancers and small businesses often struggle with:
- Tracking unpaid and overdue invoices.
- Following up with customers for pending payments.
- Managing payment collection manually.
- Monitoring their cash flow.

PayWise AI addresses these challenges through invoice management, AI-generated reminders, and integrated online payments.

## ✨ Key Features

- **Invoice Management:** Create, view, and delete invoices.
- **Dashboard Analytics:** Monitor total invoiced, payments received, and outstanding amounts.
- **AI Payment Reminders:** Generate personalized payment follow-up messages using Groq AI.
- **Voice Assistant:** Read payment reminders aloud using browser speech synthesis.
- **PayPal Sandbox Integration:** Create and capture PayPal payments.
- **INR to USD Conversion:** Maintain invoices in INR and convert amounts for PayPal checkout.
- **Automatic Payment Status Updates:** Update invoices to PAID after successful payment capture.
- **MySQL Database:** Store invoice and payment information persistently.

## 🛠️ Technology Stack

| Component | Technology |

| Frontend | React, JavaScript, Vite |
| Backend | Java 21, Spring Boot |
| Database | MySQL |
| Payment Integration | PayPal REST API Sandbox |
| AI Integration | Groq API |
| Currency Conversion | ExchangeRate-API |
| Version Control | Git and GitHub |

## 🔄 How It Works

1. Create an invoice in INR.
2. Save invoice information in MySQL.
3. Generate an AI-powered payment reminder.
4. Convert the invoice amount from INR to USD.
5. Create a PayPal Sandbox checkout.
6. Complete the payment using a Sandbox buyer account.
7. Capture the payment and update the invoice status to PAID.

## 🏗️ Project Structure

```text
PayWiseAI/
├── .github/
├── backend/
│   ├── src/
│   ├── pom.xml
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── package.json
│   └── index.html
├── .gitignore
├── LICENSE
└── README.md
```

## ⚙️ Setup Instructions

### Prerequisites

- Java 21 or later
- Node.js and npm
- MySQL
- PayPal Developer Sandbox account
- Groq API key

### 1. Clone the Repository

```bash
git clone https://github.com/VISHMITHA07/PayWiseAI.git
cd PayWiseAI
```

### 2. Configure the Database

Create a MySQL database:

```sql
CREATE DATABASE paywise_db;
```

### 3. Configure Backend Environment Variables

Create a local `.env` file inside the `backend` folder.

Configure the following variables using your own credentials:

```properties
DB_USERNAME=root
DB_PASSWORD=your_mysql_password
GROQ_API_KEY=your_groq_api_key
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
```

Never commit your actual `.env` file or credentials.

### 4. Run the Backend

```bash
cd backend
./mvnw spring-boot:run
```

On Windows:

```powershell
.\mvnw.cmd spring-boot:run
```

Backend URL: `http://localhost:8080`

### 5. Run the Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## 🔐 Security

- API keys and credentials are stored in environment variables.
- PayPal integration uses Sandbox credentials.
- The local `.env` file is excluded from version control.

## 🌱 Future Enhancements

- AI-based cash-flow forecasting.
- Automated scheduled payment reminders.
- Customer payment-risk analysis.
- Advanced financial reports and analytics.

## 👩‍💻 Project Information

**Project Name:** PayWise AI

**Developed for:** PayPal AI Hackathon 2026

**GitHub:** https://github.com/VISHMITHA07/PayWiseAI

## 📄 License

This project is licensed under the MIT License.
