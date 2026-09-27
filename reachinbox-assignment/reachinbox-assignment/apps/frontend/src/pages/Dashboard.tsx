import { useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { EmailList } from '../components/EmailList';
import { Compose } from '../components/Compose';
import { api } from '../lib/api';
import { ArrowLeft, Archive, Star, Trash2 } from 'lucide-react';

function Detail({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState<any>(null);

  useEffect(() => {
    let active = true;

    api.email(id)
      .then((data) => {
        if (active) setEmail(data);
      })
      .catch((error) => {
        console.error('Failed to load email:', error);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (!email) {
    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex-1">
      <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
        <button
          onClick={onBack}
          className="flex items-center gap-3 text-[24px]"
        >
          <ArrowLeft />
          {email.sender?.displayName || email.sender?.email}
          {' | '}
          {email.subject}
        </button>

        <div className="flex gap-5 text-slate-400">
          <Star />
          <Archive />
          <Trash2 />
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-20 py-10">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00c853] text-xl text-white">
            {email.sender?.email?.[0]?.toUpperCase() || 'U'}
          </div>

          <div>
            <div className="font-semibold">
              {email.sender?.displayName ||
                email.sender?.email}

              <span className="font-normal text-slate-400">
                {' '}
                &lt;{email.sender?.email}&gt;
              </span>
            </div>

            <div className="text-slate-400">
              to me ·{' '}
              {new Date(
                email.sentAt ||
                  email.scheduledAt ||
                  Date.now()
              ).toLocaleString()}
            </div>
          </div>
        </div>

        <div
          className="prose mt-10 max-w-none text-[17px] text-slate-700"
          dangerouslySetInnerHTML={{
            __html: email.body || '',
          }}
        />
      </div>
    </div>
  );
}

export function Dashboard() {
  const [user, setUser] = useState<any>();
  const [section, setSection] =
    useState<'scheduled' | 'sent'>('scheduled');

  const [items, setItems] = useState<any[]>([]);

  const [counts, setCounts] = useState({
    scheduled: 0,
    sent: 0,
  });

  const [compose, setCompose] = useState(false);
  const [detail, setDetail] = useState<string>();
  const [loading, setLoading] = useState(true);

  /*
   * Load user and sidebar counts.
   */
  const loadDashboard = async () => {
    try {
      const [currentUser, currentCounts] =
        await Promise.all([
          api.me(),
          api.counts(),
        ]);

      setUser(currentUser);
      setCounts(currentCounts);
    } catch (error) {
      console.error(
        'Failed to load dashboard:',
        error
      );

      window.location.href = '/login';
    }
  };

  /*
   * Load the currently selected email list.
   */
  const loadEmails = async (
    targetSection:
      | 'scheduled'
      | 'sent'
  ) => {
    try {
      const data =
        targetSection === 'scheduled'
          ? await api.scheduled()
          : await api.sent();

      setItems(data);
    } catch (error) {
      console.error(
        'Failed to load emails:',
        error
      );

      setItems([]);
    }
  };

  /*
   * Refresh both:
   * - sidebar counts
   * - current email list
   */
  const refreshDashboard = async (
    targetSection:
      | 'scheduled'
      | 'sent'
  ) => {
    await Promise.all([
      loadDashboard(),
      loadEmails(targetSection),
    ]);
  };

  /*
   * Initial dashboard load.
   */
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);

      await refreshDashboard(section);

      setLoading(false);
    };

    initialize();
  }, []);

  /*
   * Refresh email list when user switches
   * between Scheduled and Sent.
   */
  useEffect(() => {
    if (!user) return;

    loadEmails(section);
  }, [section]);

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  /*
   * Compose screen.
   */
  if (compose) {
    return (
      <Compose
        user={user}
        onBack={() => {
          setCompose(false);
        }}
        onScheduled={async (
          targetSection:
            | 'scheduled'
            | 'sent'
        ) => {
          /*
           * Close compose.
           */
          setCompose(false);

          /*
           * Open the correct section.
           *
           * Send Later -> Scheduled
           * Send      -> Sent
           */
          setSection(targetSection);

          /*
           * Refresh immediately.
           */
          await refreshDashboard(
            targetSection
          );

          /*
           * For an immediate Send, the API creates
           * the BullMQ job first and the worker changes
           * the database record to SENT asynchronously.
           *
           * Refresh again after the worker has had time
           * to process the job.
           */
          if (targetSection === 'sent') {
            window.setTimeout(() => {
              refreshDashboard('sent');
            }, 1500);
          }
        }}
      />
    );
  }

  /*
   * Email detail screen.
   */
  if (detail) {
    return (
      <Detail
        id={detail}
        onBack={() => {
          setDetail(undefined);
        }}
      />
    );
  }

  /*
   * Main dashboard.
   */
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        user={user}
        section={section}
        counts={counts}
        onSection={(value) => {
          setSection(
            value as 'scheduled' | 'sent'
          );
        }}
        onCompose={() => {
          setCompose(true);
        }}
      />

      <EmailList
        items={items}
        status={section}
        onOpen={setDetail}
        onRefresh={() => {
          refreshDashboard(section);
        }}
      />
    </div>
  );
}
