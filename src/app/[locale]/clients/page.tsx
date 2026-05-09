"use client";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useClients } from "@/hooks/useClients";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrustLevel } from "@/lib/supabase/types";
import { Plus, Pencil, Trash2, MapPin, Phone } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const TRUST_LEVELS: TrustLevel[] = ["standard", "vip", "risky"];

const trustVariant: Record<TrustLevel, "default" | "orange" | "danger"> = {
  standard: "default",
  vip: "orange",
  risky: "danger",
};

export default function ClientsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const { clients, loading, addClient, updateClient, deleteClient } = useClients();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [trustLevel, setTrustLevel] = useState<TrustLevel>("standard");
  const [note, setNote] = useState("");

  function openAdd() {
    setEditing(null);
    setName(""); setPhone(""); setCountry(""); setCity("");
    setTrustLevel("standard"); setNote("");
    setShowForm(true);
  }

  function openEdit(id: string) {
    const c = clients.find((cl) => cl.id === id);
    if (!c) return;
    setEditing(id);
    setName(c.name); setPhone(c.phone ?? ""); setCountry(c.country ?? "");
    setCity(c.city ?? ""); setTrustLevel(c.trust_level); setNote(c.note ?? "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editing) {
      await updateClient(editing, {
        name, phone: phone || null, country: country || null,
        city: city || null, trust_level: trustLevel, note: note || null,
      });
    } else {
      await addClient(user.id, name, phone || null, country || null,
        city || null, trustLevel, note || null);
    }
    setShowForm(false);
  }

  const filtered = useMemo(
    () => clients.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.country ?? "").toLowerCase().includes(search.toLowerCase())
    ),
    [clients, search]
  );

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Plus size={15} />
            {t("add")}
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tc("search")}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-orange-500 focus:outline-none"
        />

        {filtered.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {filtered.map((client) => (
              <Card key={client.id}>
                <article className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-50">
                        {client.name}
                      </h3>
                      <Badge variant={trustVariant[client.trust_level]}>
                        {t(`trust_levels.${client.trust_level}`)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {(client.city || client.country) && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin size={10} />
                          {[client.city, client.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {client.phone && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Phone size={10} />
                          {client.phone}
                        </span>
                      )}
                    </div>
                    {client.note && (
                      <p className="mt-1 truncate text-xs text-slate-600">{client.note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => openEdit(client.id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteId(client.id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">
              {editing ? tc("edit") : t("add")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("name")}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("trust_level")}</label>
                <div className="flex gap-2">
                  {TRUST_LEVELS.map((lvl) => (
                    <button key={lvl} type="button" onClick={() => setTrustLevel(lvl)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${trustLevel === lvl ? "bg-orange-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                      {t(`trust_levels.${lvl}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("country")}</label>
                  <input value={country} onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("city")}</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("phone")}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("note")}</label>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">{tc("cancel")}</button>
                <button type="submit"
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">{tc("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={tc("confirm_delete")}
        message="Supprimer ce client ?"
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => { if (deleteId) await deleteClient(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}
