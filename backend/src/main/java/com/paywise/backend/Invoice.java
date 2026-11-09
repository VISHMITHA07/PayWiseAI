
package com.paywise.backend;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String customerName;
    private String description;
    private BigDecimal amount;
    private LocalDate dueDate;
    private String status;

    // PayPal payment details
    private String paypalOrderId;
    private String paymentStatus;
    private BigDecimal paypalAmountUsd;
    private BigDecimal exchangeRateInrToUsd;
    private LocalDate exchangeRateDate;

    public Invoice() {
    }

    public Long getId() {
        return id;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPaypalOrderId() {
        return paypalOrderId;
    }

    public void setPaypalOrderId(String paypalOrderId) {
        this.paypalOrderId = paypalOrderId;
    }

    public String getPaymentStatus() {
        return paymentStatus;
    }

    public void setPaymentStatus(String paymentStatus) {
        this.paymentStatus = paymentStatus;
    }

    public BigDecimal getPaypalAmountUsd() {
        return paypalAmountUsd;
    }

    public void setPaypalAmountUsd(BigDecimal paypalAmountUsd) {
        this.paypalAmountUsd = paypalAmountUsd;
    }

    public BigDecimal getExchangeRateInrToUsd() {
        return exchangeRateInrToUsd;
    }

    public void setExchangeRateInrToUsd(BigDecimal exchangeRateInrToUsd) {
        this.exchangeRateInrToUsd = exchangeRateInrToUsd;
    }

    public LocalDate getExchangeRateDate() {
        return exchangeRateDate;
    }

    public void setExchangeRateDate(LocalDate exchangeRateDate) {
        this.exchangeRateDate = exchangeRateDate;
    }
}
