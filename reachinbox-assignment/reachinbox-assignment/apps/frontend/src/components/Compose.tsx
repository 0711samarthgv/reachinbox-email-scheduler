import { ArrowLeft, Clock3, Paperclip, X } from 'lucide-react';
import Papa from 'papaparse';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

const extractEmails = (text: string) =>
  Array.from(
    new Set(
      (
        text.match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
        ) || []
      ).map((x) => x.toLowerCase())
    )
  );

export function Compose({
  user,
  onBack,
  onScheduled,
}: {
  user: any;
  onBack: () => void;
  onScheduled: (section: 'scheduled' | 'sent') => void;
}) {
  const [senderId, setSenderId] = useState('');

  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [delay, setDelay] = useState('2000');
  const [hourly, setHourly] = useState('200');

  const [start, setStart] = useState(() =>
    new Date(Date.now() + 60000)
      .toISOString()
      .slice(0, 16)
  );

  const [loading, setLoading] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'later' | null>(null);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.emailAccounts?.length) {
      setSenderId(user.emailAccounts[0].id);
    } else {
      api
        .me()
        .then((x) => {
          setSenderId(x.emailAccounts?.[0]?.id || '');
        })
        .catch(() => {});
    }
  }, [user]);

  const visible = useMemo(
    () => recipients.slice(0, 3),
    [recipients]
  );

  const addRecipients = (emails: string[]) => {
    if (!emails.length) return;

    setRecipients((current) => {
      const existing = new Set(
        current.map((email) => email.toLowerCase())
      );

      const next = [...current];

      emails.forEach((email) => {
        const normalized = email.trim().toLowerCase();

        if (
          normalized &&
          !existing.has(normalized)
        ) {
          next.push(normalized);
          existing.add(normalized);
        }
      });

      return next;
    });
  };

  const addTypedRecipients = () => {
    const emails = extractEmails(recipientInput);

    if (emails.length) {
      addRecipients(emails);
      setRecipientInput('');
    }
  };

  const handleRecipientKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      e.key === 'Enter' ||
      e.key === ',' ||
      e.key === ';'
    ) {
      e.preventDefault();
      addTypedRecipients();
      return;
    }

    if (
      e.key === 'Backspace' &&
      !recipientInput &&
      recipients.length > 0
    ) {
      setRecipients((current) =>
        current.slice(0, -1)
      );
    }
  };

  const handleRecipientBlur = () => {
    if (recipientInput.trim()) {
      addTypedRecipients();
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients((current) =>
      current.filter((item) => item !== email)
    );
  };

  const upload = (file: File) => {
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || '');

      try {
        const parsed = Papa.parse<string[]>(text);

        const flat = (parsed.data as any[])
          .flat(Infinity)
          .join('\n');

        const emails = extractEmails(flat);

        if (!emails.length) {
          setError(
            'No valid email addresses were found in the uploaded file.'
          );
          return;
        }

        addRecipients(emails);
        setError('');
      } catch {
        setError(
          'Unable to read the uploaded recipient file.'
        );
      }
    };

    reader.readAsText(file);
  };

  const getFinalRecipients = () => {
    let finalRecipients = [...recipients];

    if (recipientInput.trim()) {
      finalRecipients = [
        ...finalRecipients,
        ...extractEmails(recipientInput),
      ];
    }

    finalRecipients = Array.from(
      new Set(
        finalRecipients.map((email) =>
          email.toLowerCase()
        )
      )
    );

    return finalRecipients;
  };

  const sendNow = async () => {
    setError('');

    const finalRecipients = getFinalRecipients();

    if (
      !senderId ||
      !finalRecipients.length ||
      !subject.trim() ||
      !body.trim()
    ) {
      setError(
        'Please fill sender, recipients, subject and body.'
      );
      return;
    }

    try {
      setLoading(true);
      setSendMode('now');

      await api.schedule({
        senderId,
        recipients: finalRecipients,
        subject,
        body,
        startTime: new Date().toISOString(),
        delayMs: Number(delay),
        hourlyLimit: Number(hourly),
      });

      setRecipientInput('');
      setRecipients([]);

      onScheduled('sent');
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to send the email.'
      );
    } finally {
      setLoading(false);
      setSendMode(null);
    }
  };

  const schedule = async () => {
    setError('');

    const finalRecipients = getFinalRecipients();

    if (
      !senderId ||
      !finalRecipients.length ||
      !subject.trim() ||
      !body.trim()
    ) {
      return setError(
        'Please fill sender, recipients, subject and body.'
      );
    }

    const selectedStart =
      new Date(start).getTime();

    if (Number.isNaN(selectedStart)) {
      return setError(
        'Please select a valid start time.'
      );
    }

    if (selectedStart <= Date.now()) {
      return setError(
        'For Send Later, please select a future date and time.'
      );
    }

    try {
      setLoading(true);
      setSendMode('later');

      await api.schedule({
        senderId,
        recipients: finalRecipients,
        subject,
        body,
        startTime: new Date(start).toISOString(),
        delayMs: Number(delay),
        hourlyLimit: Number(hourly),
      });

      setRecipientInput('');
      setRecipients([]);

      onScheduled('scheduled');
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to schedule the emails.'
      );
    } finally {
      setLoading(false);
      setSendMode(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex items-center justify-between px-8 py-5">
        <button
          onClick={onBack}
          className="flex items-center gap-3 text-[25px] text-slate-800"
        >
          <ArrowLeft />
          Compose New Email
        </button>

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() =>
              inputRef.current?.click()
            }
            title="Upload recipient list"
          >
            <Paperclip
              className="text-[#00ad45]"
              size={24}
            />
          </button>

          <Clock3
            className="text-[#00ad45]"
            size={24}
          />

          <button
            type="button"
            onClick={sendNow}
            disabled={loading}
            className="rounded-full bg-[#00ad45] px-7 py-2.5 font-medium text-white transition hover:bg-[#009b3e] disabled:opacity-50"
          >
            {sendMode === 'now'
              ? 'Sending...'
              : 'Send'}
          </button>

          <button
            type="button"
            onClick={schedule}
            disabled={loading}
            className="rounded-full border border-[#00ad45] px-7 py-2.5 font-medium text-[#00ad45] transition hover:bg-[#ecfbf1] disabled:opacity-50"
          >
            {sendMode === 'later'
              ? 'Scheduling...'
              : 'Send Later'}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-20 pt-8">
        <div className="grid grid-cols-[70px_1fr] items-center border-b border-slate-200 py-2">
          <span>From</span>

          <select
            value={senderId}
            onChange={(e) =>
              setSenderId(e.target.value)
            }
            className="w-fit rounded-xl bg-[#f3f5f4] px-4 py-3 outline-none"
          >
            <option value="">
              Select sender
            </option>

            {user?.emailAccounts?.map(
              (a: any) => (
                <option
                  key={a.id}
                  value={a.id}
                >
                  {a.email}
                </option>
              )
            )}
          </select>
        </div>

        <div className="grid grid-cols-[70px_1fr] items-start border-b border-slate-200 py-3">
          <span className="pt-2">
            To
          </span>

          <div className="flex items-start gap-3">
            <div
              className="flex min-h-[42px] flex-1 cursor-text flex-wrap items-center gap-2 rounded-xl px-1 py-1"
              onClick={() =>
                recipientInputRef.current?.focus()
              }
            >
              {visible.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-1 rounded-full border border-[#00ad45] bg-[#ecfbf1] px-3 py-1 text-sm text-slate-700"
                >
                  {email}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecipient(email);
                    }}
                    className="ml-1 rounded-full text-slate-500 hover:text-red-500"
                    aria-label={`Remove ${email}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}

              {recipients.length > 3 && (
                <span className="rounded-full border border-[#00ad45] bg-[#ecfbf1] px-3 py-1 text-sm text-slate-700">
                  +{recipients.length - 3}
                </span>
              )}

              <input
                ref={recipientInputRef}
                type="text"
                value={recipientInput}
                onChange={(e) =>
                  setRecipientInput(
                    e.target.value
                  )
                }
                onKeyDown={
                  handleRecipientKeyDown
                }
                onBlur={handleRecipientBlur}
                placeholder={
                  recipients.length
                    ? 'Add recipient...'
                    : 'Enter email address'
                }
                className="min-w-[180px] flex-1 border-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                inputRef.current?.click()
              }
              className="whitespace-nowrap pt-2 text-[#00ad45] hover:underline"
            >
              ↥ Upload List
            </button>

            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const file =
                  e.target.files?.[0];

                if (file) {
                  upload(file);
                }

                e.target.value = '';
              }}
            />
          </div>
        </div>

        {recipients.length > 0 && (
          <div className="ml-[70px] mt-2 text-sm text-slate-500">
            {recipients.length} email address
            {recipients.length !== 1
              ? 'es'
              : ''}{' '}
            added.
          </div>
        )}

        <div className="grid grid-cols-[70px_1fr] border-b border-slate-200 py-3">
          <span>Subject</span>

          <input
            value={subject}
            onChange={(e) =>
              setSubject(e.target.value)
            }
            placeholder="Subject"
            className="outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-6 py-4">
          <label>
            Delay between 2 emails

            <input
              type="number"
              min="0"
              value={Number(delay) / 1000}
              onChange={(e) =>
                setDelay(
                  String(
                    Math.max(
                      0,
                      Number(e.target.value)
                    ) * 1000
                  )
                )
              }
              className="ml-2 w-24 rounded-xl border border-slate-200 px-3 py-2 outline-none"
            />

            {' '}sec
          </label>

          <label>
            Hourly Limit

            <input
              type="number"
              min="1"
              value={hourly}
              onChange={(e) =>
                setHourly(e.target.value)
              }
              className="ml-2 w-24 rounded-xl border border-slate-200 px-3 py-2 outline-none"
            />
          </label>

          <label className="ml-auto">
            Start

            <input
              type="datetime-local"
              value={start}
              onChange={(e) =>
                setStart(e.target.value)
              }
              className="ml-2 rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
        </div>

        <div className="rounded-[18px] bg-[#fafafa] p-5">
          <div className="min-h-[400px] rounded-xl bg-white p-4">
            <textarea
              value={body}
              onChange={(e) =>
                setBody(e.target.value)
              }
              placeholder="Type Your Reply..."
              className="h-[380px] w-full resize-none outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}