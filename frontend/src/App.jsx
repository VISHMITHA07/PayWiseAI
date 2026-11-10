
import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:8080/api/invoices'
const REMINDER_API_URL = 'http://localhost:8080/api/reminders/generate'
const PAYPAL_API_URL = 'http://localhost:8080/api/paypal'
const POLL_INTERVAL = 15000

function App() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [paymentLoadingId, setPaymentLoadingId] = useState(null)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [deletingInvoiceId, setDeletingInvoiceId] = useState(null)

  const [form, setForm] = useState({
    customerName: '',
    description: '',
    amount: '',
    dueDate: '',
    status: 'PENDING',
  })

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [reminderText, setReminderText] = useState('')
  const [generatingReminder, setGeneratingReminder] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')

  const [voiceStatus, setVoiceStatus] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  const [automaticVoiceEnabled, setAutomaticVoiceEnabled] = useState(() => {
    try {
      return localStorage.getItem('paywise_automatic_voice') === 'true'
    } catch {
      return false
    }
  })

  const paypalReturnHandled = useRef(false)
  const speechRef = useRef(null)

  const previousInvoicesRef = useRef(null)
  const voiceEnabledRef = useRef(automaticVoiceEnabled)
  const voiceQueueRef = useRef([])
  const queuedVoiceKeysRef = useRef(new Set())
  const automaticSpeakingRef = useRef(false)
  const voiceEventCounterRef = useRef(0)

  // DATE HELPERS

  function getLocalDateString(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function getTomorrowDateString() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return getLocalDateString(tomorrow)
  }

  // CURRENCY FORMAT

  function formatAmount(amount) {
    return (
      '₹' +
      Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    )
  }

  // AUTOMATIC VOICE QUEUE

  function addAutomaticVoice(text, key = null, afterSpeak = null) {
    if (!text || !voiceEnabledRef.current) return

    if (key && queuedVoiceKeysRef.current.has(key)) return

    if (key) {
      queuedVoiceKeysRef.current.add(key)
    }

    voiceQueueRef.current.push({
      text,
      key,
      afterSpeak,
    })

    processAutomaticVoiceQueue()
  }

  async function processAutomaticVoiceQueue() {
    if (!voiceEnabledRef.current) return
    if (automaticSpeakingRef.current) return
    if (voiceQueueRef.current.length === 0) return
    if (!('speechSynthesis' in window)) return

    const item = voiceQueueRef.current.shift()

    const speech = new SpeechSynthesisUtterance(item.text)

    speechRef.current = speech
    automaticSpeakingRef.current = true

    const voices = window.speechSynthesis.getVoices()

    const englishVoice =
      voices.find(voice => voice.lang.toLowerCase() === 'en-in') ||
      voices.find(voice => voice.lang.toLowerCase().startsWith('en'))

    if (englishVoice) {
      speech.voice = englishVoice
    }

    speech.lang = englishVoice?.lang || 'en-IN'
    speech.rate = 0.9
    speech.pitch = 1

    speech.onstart = () => {
      setVoiceStatus('Automatic voice: ' + item.text)
      setIsSpeaking(true)
    }

    speech.onend = async () => {
      if (item.key) {
        queuedVoiceKeysRef.current.delete(item.key)
      }

      setIsSpeaking(false)
      speechRef.current = null

      // Wait for this announcement's follow-up check
      // before starting the next queued announcement.

      try {
        if (item.afterSpeak && voiceEnabledRef.current) {
          await item.afterSpeak()
        }
      } catch (err) {
        setVoiceStatus(
          'Could not check the latest invoices: ' + err.message
        )
      }

      automaticSpeakingRef.current = false
      processAutomaticVoiceQueue()
    }

    speech.onerror = event => {
      if (item.key) {
        queuedVoiceKeysRef.current.delete(item.key)
      }

      automaticSpeakingRef.current = false
      setIsSpeaking(false)
      speechRef.current = null

      setVoiceStatus('Automatic voice error: ' + event.error)

      processAutomaticVoiceQueue()
    }

    window.speechSynthesis.speak(speech)
  }

  // FETCH LATEST INVOICES AFTER EVENT ANNOUNCEMENT

  async function fetchAndAnnounceReminders(cycleId) {
    if (!voiceEnabledRef.current) return

    const response = await fetch(API_URL)

    if (!response.ok) {
      throw new Error('Could not fetch the latest invoices.')
    }

    const latestInvoices = await response.json()

    setInvoices(latestInvoices)

    // Do not run event detection here.
    // This fetch is only for the pending and overdue voice check.

    announcePendingAndOverdue(latestInvoices, cycleId)
  }

  // CHECK AND ANNOUNCE PENDING AND OVERDUE

  function announcePendingAndOverdue(invoiceList, cycleId) {
    if (!voiceEnabledRef.current) return

    const today = getLocalDateString()
    const tomorrow = getTomorrowDateString()

    const pendingInvoices = []
    const overdueInvoices = []

    invoiceList.forEach(invoice => {
      const status = (invoice.status || 'PENDING').toUpperCase()
      const dueDate = String(invoice.dueDate || '')

      if (status === 'PAID') return

      if (status === 'OVERDUE' || (dueDate && dueDate < today)) {
        overdueInvoices.push(invoice)
      } else {
        pendingInvoices.push(invoice)
      }
    })

    const sortByDueDate = (a, b) =>
      String(a.dueDate || '').localeCompare(
        String(b.dueDate || '')
      )

    pendingInvoices.sort(sortByDueDate)
    overdueInvoices.sort(sortByDueDate)

    // PENDING FIRST

    const pendingMessages = pendingInvoices.map(invoice => {
      const customer = invoice.customerName || 'Customer'
      const amount = formatAmount(invoice.amount)
      const dueDate = String(invoice.dueDate || '')

      let reminder =
        `Payment pending. ${customer} has an unpaid invoice of ${amount}.`

      if (dueDate === today) {
        reminder =
          `Payment reminder! Today is the due date for ${customer}. The payment amount is ${amount}.`
      } else if (dueDate === tomorrow) {
        reminder =
          `Upcoming payment reminder! ${customer} has a payment of ${amount} due tomorrow.`
      }

      return {
        text: reminder,
        key: `pending_event_${cycleId}_${invoice.id}`,
      }
    })

    // OVERDUE SECOND

    const overdueMessages = overdueInvoices.map(invoice => ({
      text:
        `Attention! ${invoice.customerName || 'Customer'} has an overdue payment of ${formatAmount(invoice.amount)}. Please follow up with this customer.`,
      key: `overdue_event_${cycleId}_${invoice.id}`,
    }))

    // Add the complete follow-up sequence together.
    // This keeps pending before overdue.

    const reminders = [
      ...pendingMessages,
      ...overdueMessages,
    ]

    reminders.forEach(item => {
      if (!queuedVoiceKeysRef.current.has(item.key)) {
        queuedVoiceKeysRef.current.add(item.key)
      }
    })

    voiceQueueRef.current.push(...reminders)

    processAutomaticVoiceQueue()
  }

  // DETECT NEW INVOICES AND NEW PAYMENTS

  function detectInvoiceEvents(newInvoices) {
    const previousInvoices = previousInvoicesRef.current

    // FIRST LOAD:
    // Do not announce historical paid invoices.

    if (previousInvoices === null) {
      previousInvoicesRef.current = newInvoices
      return
    }

    const previousMap = new Map(
      previousInvoices.map(invoice => [
        String(invoice.id),
        invoice,
      ])
    )

    const newlyAddedInvoices = newInvoices.filter(
      invoice => !previousMap.has(String(invoice.id))
    )

    const newlyPaidInvoices = newInvoices.filter(invoice => {
      const previousInvoice = previousMap.get(String(invoice.id))

      if (!previousInvoice) return false

      const oldStatus = (previousInvoice.status || '').toUpperCase()
      const newStatus = (invoice.status || '').toUpperCase()

      return oldStatus !== 'PAID' && newStatus === 'PAID'
    })

    previousInvoicesRef.current = newInvoices

    if (!voiceEnabledRef.current) return

    // PAYMENT EVENT:
    // PAID voice first.
    // After it finishes, fetch and announce pending and overdue.

    newlyPaidInvoices.forEach(invoice => {
      voiceEventCounterRef.current += 1
      const cycleId = voiceEventCounterRef.current

      addAutomaticVoice(
        `Payment received successfully! ${invoice.customerName || 'Customer'} has paid ${formatAmount(invoice.amount)}. Thank you!`,
        `payment_event_${cycleId}_${invoice.id}`,
        () => fetchAndAnnounceReminders(cycleId)
      )
    })

    // NEW INVOICE EVENT:
    // New invoice voice first.
    // After it finishes, fetch and announce pending and overdue.

    newlyAddedInvoices.forEach(invoice => {
      voiceEventCounterRef.current += 1
      const cycleId = voiceEventCounterRef.current

      addAutomaticVoice(
        `New invoice added successfully for ${invoice.customerName || 'Customer'}. The invoice amount is ${formatAmount(invoice.amount)}.`,
        `new_invoice_event_${cycleId}_${invoice.id}`,
        () => fetchAndAnnounceReminders(cycleId)
      )
    })
  }

  // ENABLE AUTOMATIC VOICE

  function enableAutomaticVoice() {
    if (!('speechSynthesis' in window)) {
      setVoiceStatus(
        'Your browser does not support voice. Please use Google Chrome.'
      )
      return
    }

    voiceEnabledRef.current = true
    setAutomaticVoiceEnabled(true)

    try {
      localStorage.setItem('paywise_automatic_voice', 'true')
    } catch {
      // Voice remains enabled for this session.
    }

    addAutomaticVoice(
      'PayWise AI automatic voice assistant is now enabled.'
    )

    // Announce current pending and overdue invoices after enabling.

    voiceEventCounterRef.current += 1

    const cycleId = voiceEventCounterRef.current

    addAutomaticVoice(
      'Checking your current pending and overdue invoices.',
      null,
      () => fetchAndAnnounceReminders(cycleId)
    )
  }

  // DISABLE AUTOMATIC VOICE

  function disableAutomaticVoice() {
    voiceEnabledRef.current = false
    setAutomaticVoiceEnabled(false)

    try {
      localStorage.setItem('paywise_automatic_voice', 'false')
    } catch {
      // Voice remains disabled.
    }

    voiceQueueRef.current = []
    queuedVoiceKeysRef.current.clear()
    automaticSpeakingRef.current = false

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    speechRef.current = null
    setIsSpeaking(false)
    setIsPaused(false)
    setVoiceStatus('Automatic voice assistant disabled.')
  }

  // LOAD INVOICES

  async function loadInvoices(silent = false) {
    try {
      const response = await fetch(API_URL)

      if (!response.ok) {
        throw new Error('Could not load invoices.')
      }

      const data = await response.json()

      detectInvoiceEvents(data)

      setInvoices(data)

      if (!silent) {
        setError('')
      }
    } catch (err) {
      if (!silent) {
        setError(
          'Cannot connect to the backend. Check that Spring Boot is running.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  // INITIAL LOAD AND 15-SECOND REFRESH

  useEffect(() => {
    loadInvoices()

    const interval = setInterval(() => {
      loadInvoices(true)
    }, POLL_INTERVAL)

    return () => {
      clearInterval(interval)

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // DELETE INVOICE

  async function handleDeleteInvoice(invoice) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the invoice for ${invoice.customerName} (${formatAmount(invoice.amount)})?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    setDeletingInvoiceId(invoice.id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API_URL}/${encodeURIComponent(invoice.id)}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const details = await response.text()
        throw new Error(details || 'Could not delete this invoice.')
      }

      if (String(selectedInvoiceId) === String(invoice.id)) {
        setSelectedInvoiceId('')
        setReminderText('')
        setCopyMessage('')
      }

      setMessage(
        `Invoice for ${invoice.customerName} deleted successfully.`
      )

      await loadInvoices()
    } catch (err) {
      setError(err.message || 'Unable to delete invoice.')
    } finally {
      setDeletingInvoiceId(null)
    }
  }

  // PAYPAL RETURN HANDLING

  useEffect(() => {
    async function handlePayPalReturn() {
      const currentPath = window.location.pathname
      const params = new URLSearchParams(window.location.search)

      if (currentPath === '/paypal/success') {
        if (paypalReturnHandled.current) return
        paypalReturnHandled.current = true

        const orderId = params.get('token')

        if (!orderId) {
          setPaymentMessage('PayPal returned without an order ID.')
          window.history.replaceState({}, document.title, '/')
          return
        }

        setPaymentMessage('Verifying your PayPal payment...')

        try {
          const response = await fetch(
            `${PAYPAL_API_URL}/capture/${encodeURIComponent(orderId)}`,
            { method: 'POST' }
          )

          const data = await response.json()

          if (!response.ok) {
            throw new Error(data.error || 'Payment verification failed.')
          }

          if (data.paid) {
            setPaymentMessage(
              'Payment successful! Your invoice has been marked as PAID.'
            )
          } else {
            setPaymentMessage(
              `Payment is not completed. PayPal status: ${data.status}`
            )
          }

          await loadInvoices()
        } catch (err) {
          setPaymentMessage(
            err.message || 'Could not verify PayPal payment.'
          )
        } finally {
          window.history.replaceState({}, document.title, '/')
        }
      } else if (currentPath === '/paypal/cancel') {
        setPaymentMessage(
          'Payment cancelled. Your invoice remains unpaid.'
        )

        window.history.replaceState({}, document.title, '/')
      }
    }

    handlePayPalReturn()
  }, [])

  // INVOICE FORM

  function handleChange(event) {
    const { name, value } = event.target

    setForm(previousForm => ({
      ...previousForm,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      })

      if (!response.ok) {
        const details = await response.text()
        throw new Error(details || 'Could not save the invoice.')
      }

      setMessage('Invoice saved successfully!')

      setForm({
        customerName: '',
        description: '',
        amount: '',
        dueDate: '',
        status: 'PENDING',
      })

      await loadInvoices()
    } catch (err) {
      setError(err.message || 'Unable to save invoice.')
    } finally {
      setSaving(false)
    }
  }

  // DASHBOARD TOTALS

  const total = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount || 0),
    0
  )

  const paid = invoices
    .filter(invoice => invoice.status?.toUpperCase() === 'PAID')
    .reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0
    )

  const outstanding = invoices
    .filter(invoice => invoice.status?.toUpperCase() !== 'PAID')
    .reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0
    )

  // PAYPAL CHECKOUT

  async function handlePayPalCheckout(invoice) {
    if (!invoice || invoice.status?.toUpperCase() === 'PAID') {
      return
    }

    setPaymentLoadingId(invoice.id)
    setPaymentMessage('')
    setError('')

    try {
      const response = await fetch(
        `${PAYPAL_API_URL}/create-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoiceId: invoice.id,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not create PayPal order.'
        )
      }

      if (!data.approvalUrl) {
        throw new Error('PayPal approval link is missing.')
      }

      setPaymentMessage(
        `Invoice ${formatAmount(data.invoiceAmountInr)} converted to $${data.paypalAmountUsd} USD. Redirecting to PayPal...`
      )

      window.location.href = data.approvalUrl
    } catch (err) {
      setError(err.message || 'PayPal checkout failed.')
      setPaymentLoadingId(null)
    }
  }

  // MANUAL VOICE REMINDER

  function stopReminder() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    speechRef.current = null
    automaticSpeakingRef.current = false
    voiceQueueRef.current = []
    queuedVoiceKeysRef.current.clear()

    setIsSpeaking(false)
    setIsPaused(false)
    setVoiceStatus('Voice stopped.')
  }

  function speakReminder(textToSpeak = reminderText) {
    if (!textToSpeak.trim()) {
      setVoiceStatus('Please generate an English reminder first.')
      return
    }

    if (!('speechSynthesis' in window)) {
      setVoiceStatus('Voice is not supported in this browser.')
      return
    }

    window.speechSynthesis.cancel()

    automaticSpeakingRef.current = false
    voiceQueueRef.current = []
    queuedVoiceKeysRef.current.clear()

    const speech = new SpeechSynthesisUtterance(textToSpeak)
    speechRef.current = speech

    const voices = window.speechSynthesis.getVoices()

    const englishVoice =
      voices.find(voice => voice.lang.toLowerCase() === 'en-in') ||
      voices.find(voice => voice.lang.toLowerCase().startsWith('en'))

    if (englishVoice) {
      speech.voice = englishVoice
    }

    speech.lang = englishVoice?.lang || 'en-IN'
    speech.rate = 0.9
    speech.pitch = 1

    speech.onstart = () => {
      setVoiceStatus('Speaking English reminder...')
      setIsSpeaking(true)
      setIsPaused(false)
    }

    speech.onend = () => {
      setVoiceStatus('English reminder completed.')
      setIsSpeaking(false)
      setIsPaused(false)
      speechRef.current = null
    }

    speech.onerror = event => {
      setVoiceStatus(`Voice playback failed: ${event.error}`)
      setIsSpeaking(false)
      setIsPaused(false)
      speechRef.current = null
    }

    window.speechSynthesis.speak(speech)
  }

  // GENERATE AI REMINDER

  async function generateReminder() {
    const invoice = invoices.find(
      item => String(item.id) === selectedInvoiceId
    )

    if (!invoice) {
      setReminderText('Please select an invoice first.')
      return
    }

    if (invoice.status?.toUpperCase() === 'PAID') {
      setReminderText(
        'This invoice is already paid. Please select a pending invoice.'
      )
      return
    }

    setGeneratingReminder(true)
    setReminderText('')
    setCopyMessage('')
    setError('')
    setVoiceStatus('Generating your reminder...')

    try {
      const params = new URLSearchParams({
        customerName: invoice.customerName || '',
        description: invoice.description || '',
        amount: String(invoice.amount || 0),
        dueDate: String(invoice.dueDate || ''),
      })

      const response = await fetch(
        `${REMINDER_API_URL}?${params.toString()}`
      )

      if (!response.ok) {
        const errorDetails = await response.text()
        throw new Error(
          errorDetails || 'Could not generate the reminder.'
        )
      }

      const text = await response.text()

      if (!text.trim()) {
        throw new Error('The AI returned an empty reminder.')
      }

      setReminderText(text.trim())
      setVoiceStatus('Reminder generated. Click Listen to hear it.')
    } catch (err) {
      setError(err.message || 'Could not generate the reminder.')
      setVoiceStatus('')
    } finally {
      setGeneratingReminder(false)
    }
  }

  // COPY REMINDER

  async function copyReminder() {
    if (!reminderText.trim()) {
      setCopyMessage('There is no reminder to copy.')
      return
    }

    try {
      await navigator.clipboard.writeText(reminderText)
      setCopyMessage('English reminder copied successfully!')
    } catch {
      setCopyMessage('Copy failed. Please copy manually.')
    }
  }

  // PAUSE AND RESUME

  function pauseReminder() {
    if (
      !('speechSynthesis' in window) ||
      !window.speechSynthesis.speaking
    ) {
      return
    }

    window.speechSynthesis.pause()
    setIsPaused(true)
    setVoiceStatus('Reminder paused.')
  }

  function resumeReminder() {
    if (!('speechSynthesis' in window)) return

    window.speechSynthesis.resume()
    setIsPaused(false)
    setVoiceStatus('Reminder resumed.')
  }

  // DISPLAY

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>PayWise AI</h2>
        <p className="nav active">Dashboard</p>
        <p className="nav">Invoices</p>
        <p className="nav">Payments</p>
        <p className="nav">AI Reminders</p>
      </aside>

      <main className="main">
        <header>
          <div>
            <h1>Dashboard</h1>
            <p>Welcome back! Here's your payment overview.</p>
            <p>Data source: MySQL database via Spring Boot</p>
            <p>Invoice currency: INR | PayPal checkout: USD</p>
          </div>

          <span className="avatar">P</span>
        </header>

        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {paymentMessage && <p role="status">{paymentMessage}</p>}

        {/* AUTOMATIC VOICE ASSISTANT */}

        <section className="reminder">
          <h2>Automatic Voice Payment Assistant</h2>

          <p>
            PayWise AI announces new invoices and successful payments
            first, then checks and announces all pending and overdue
            invoices.
          </p>

          {!automaticVoiceEnabled ? (
            <button
              type="button"
              onClick={enableAutomaticVoice}
            >
              🔊 Enable Automatic Voice
            </button>
          ) : (
            <button
              type="button"
              onClick={disableAutomaticVoice}
            >
              🔇 Disable Automatic Voice
            </button>
          )}

          <p role="status">
            {automaticVoiceEnabled
              ? 'Automatic voice assistant is enabled.'
              : 'Automatic voice assistant is disabled.'}
          </p>

          {voiceStatus && <p role="status">{voiceStatus}</p>}
        </section>

        {/* DASHBOARD SUMMARY */}

        <section className="summary">
          <article className="card">
            <p>Total Invoiced</p>
            <h2>{formatAmount(total)}</h2>
          </article>

          <article className="card">
            <p>Payments Received</p>
            <h2>{formatAmount(paid)}</h2>
          </article>

          <article className="card">
            <p>Outstanding</p>
            <h2>{formatAmount(outstanding)}</h2>
          </article>
        </section>

        {/* ADD INVOICE */}

        <section className="invoice-section">
          <h2>Add New Invoice</h2>

          <form onSubmit={handleSubmit} className="invoice-form">
            <label>
              Customer Name
              <input
                name="customerName"
                value={form.customerName}
                onChange={handleChange}
                placeholder="Enter customer name"
                required
              />
            </label>

            <label>
              Description
              <input
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="e.g. Website development"
                required
              />
            </label>

            <label>
              Amount (₹ INR)
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={handleChange}
                placeholder="Enter amount in INR"
                required
              />
            </label>

            <label>
              Due Date
              <input
                name="dueDate"
                type="date"
                value={form.dueDate}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Invoice Status
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
              >
                <option value="PENDING">Pending</option>
                <option value="OVERDUE">Overdue</option>
              </select>
            </label>

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add Invoice'}
            </button>
          </form>
        </section>

        {/* INVOICE TABLE */}

        <section className="invoice-section">
          <h2>Recent Invoices</h2>

          {loading ? (
            <p>Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p>No invoices yet. Add your first invoice above.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Description</th>
                    <th>Amount (INR)</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {invoices.map(invoice => (
                    <tr key={invoice.id}>
                      <td>{invoice.customerName}</td>
                      <td>{invoice.description}</td>
                      <td>{formatAmount(invoice.amount)}</td>
                      <td>{invoice.dueDate}</td>

                      <td>
                        <span
                          className={`status ${(invoice.status || 'pending').toLowerCase()}`}
                        >
                          {invoice.status}
                        </span>
                      </td>

                      <td>
                        {invoice.status?.toUpperCase() === 'PAID' ? (
                          <span>Payment received</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePayPalCheckout(invoice)}
                            disabled={paymentLoadingId === invoice.id}
                          >
                            {paymentLoadingId === invoice.id
                              ? 'Processing...'
                              : 'Pay with PayPal'}
                          </button>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => handleDeleteInvoice(invoice)}
                          disabled={deletingInvoiceId === invoice.id}
                        >
                          {deletingInvoiceId === invoice.id
                            ? 'Deleting...'
                            : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* MANUAL AI PAYMENT REMINDER */}

        <section className="reminder">
          <div>
            <h2>AI Payment Assistant</h2>

            <p>
              Generate English payment reminders for your saved,
              unpaid invoices.
            </p>
          </div>

          <span className="sparkle">✦ AI</span>

          <div className="reminder-controls">
            <label>
              Select Invoice

              <select
                value={selectedInvoiceId}
                onChange={event => {
                  setSelectedInvoiceId(event.target.value)
                  setReminderText('')
                  setCopyMessage('')
                  setVoiceStatus('')
                }}
              >
                <option value="">Choose an invoice</option>

                {invoices
                  .filter(
                    invoice =>
                      invoice.status?.toUpperCase() !== 'PAID'
                  )
                  .map(invoice => (
                    <option
                      key={invoice.id}
                      value={String(invoice.id)}
                    >
                      {invoice.customerName} — {formatAmount(invoice.amount)}
                    </option>
                  ))}
              </select>
            </label>

            <button
              type="button"
              onClick={generateReminder}
              disabled={generatingReminder || !selectedInvoiceId}
            >
              {generatingReminder
                ? 'Generating...'
                : 'Generate Reminder'}
            </button>
          </div>

          {generatingReminder && (
            <p>Generating your AI English reminder...</p>
          )}

          {reminderText && (
            <div className="reminder-output">
              <h3>English Payment Reminder</h3>

              <p className="reminder-text">{reminderText}</p>

              <button type="button" onClick={copyReminder}>
                Copy English Reminder
              </button>

              {copyMessage && <p role="status">{copyMessage}</p>}

              <div className="voice-controls">
                <h3>English Voice Payment Reminder</h3>

                <button
                  type="button"
                  onClick={() => speakReminder()}
                  disabled={isSpeaking}
                >
                  🔊 Listen
                </button>

                <button
                  type="button"
                  onClick={pauseReminder}
                  disabled={!isSpeaking || isPaused}
                >
                  ⏸ Pause
                </button>

                <button
                  type="button"
                  onClick={resumeReminder}
                  disabled={!isPaused}
                >
                  ▶ Resume
                </button>

                <button
                  type="button"
                  onClick={stopReminder}
                  disabled={!isSpeaking && !isPaused}
                >
                  ⏹ Stop
                </button>

                {voiceStatus && <p role="status">{voiceStatus}</p>}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
