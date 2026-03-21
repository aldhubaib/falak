import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MoreVertical, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Profile {
  id: string;
  handle: string;
  nameAr: string | null;
  nameEn: string | null;
  avatarUrl: string | null;
  color: string | null;
}

export default function ProfilePicker() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addHandle, setAddHandle] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editNameAr, setEditNameAr] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProfile, setDeleteProfile] = useState<Profile | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchProfiles = () => {
    fetch("/api/profiles", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          navigate("/login", { replace: true });
          return [];
        }
        return r.ok ? r.json() : [];
      })
      .then((list) => setProfiles(Array.isArray(list) ? list : []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleAdd = () => {
    const val = addHandle.trim();
    if (!val) { setAddError("Please enter a YouTube handle"); return; }
    setAddError("");
    setAddLoading(true);
    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ handle: val }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e?.error || "Failed")));
        return r.json();
      })
      .then(() => { setAddOpen(false); setAddHandle(""); fetchProfiles(); })
      .catch((err) => setAddError(err.message))
      .finally(() => setAddLoading(false));
  };

  const handleEdit = () => {
    if (!editProfile) return;
    setEditLoading(true);
    fetch(`/api/profiles/${editProfile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nameAr: editNameAr, color: editColor || null }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { setEditOpen(false); fetchProfiles(); })
      .catch(() => {})
      .finally(() => setEditLoading(false));
  };

  const handleDelete = () => {
    if (!deleteProfile) return;
    setDeleteLoading(true);
    fetch(`/api/profiles/${deleteProfile.id}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { setDeleteOpen(false); fetchProfiles(); })
      .catch(() => {})
      .finally(() => setDeleteLoading(false));
  };

  const openEdit = (p: Profile) => {
    setEditProfile(p);
    setEditNameAr(p.nameAr || "");
    setEditColor(p.color || "");
    setEditOpen(true);
    setMenuOpen(null);
  };

  const openDelete = (p: Profile) => {
    setDeleteProfile(p);
    setDeleteOpen(true);
    setMenuOpen(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center px-6 py-16">
      <h1 className="text-[22px] font-semibold text-foreground mb-2 tracking-tight">
        Choose your profile
      </h1>
      <p className="text-[13px] text-dim mb-10">Select a channel to manage</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-[800px] w-full">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="relative group flex flex-col items-center rounded-lg bg-card border border-border/50 px-4 py-6 cursor-pointer hover:border-blue/40 hover:bg-card transition-all"
            onClick={() => navigate(`/c/${p.id}/`)}
          >
            {/* Three-dot menu */}
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-dim opacity-0 group-hover:opacity-100 hover:bg-elevated/60 hover:text-sensor transition-all"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen === p.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                <div className="absolute top-10 right-2 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[130px]">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-dim hover:text-sensor hover:bg-elevated/60 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openDelete(p); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </>
            )}

            {/* Avatar */}
            {p.avatarUrl ? (
              <img
                src={p.avatarUrl}
                alt={p.nameAr || p.handle}
                className="w-16 h-16 rounded-full object-cover mb-3 ring-2 ring-border/30"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full mb-3 flex items-center justify-center text-[18px] font-bold text-foreground ring-2 ring-border/30"
                style={{ backgroundColor: p.color || "hsl(var(--primary))" }}
              >
                {(p.nameAr || p.handle || "?").charAt(0).toUpperCase()}
              </div>
            )}

            <span className="text-[13px] font-medium text-foreground text-center truncate w-full" dir="rtl">
              {p.nameAr || p.nameEn || p.handle}
            </span>
            <span className="text-[11px] text-dim font-mono mt-0.5 truncate w-full text-center">
              {p.handle?.startsWith("@") ? p.handle : `@${p.handle}`}
            </span>
          </div>
        ))}

        {/* Add card */}
        <div
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/40 px-4 py-6 cursor-pointer hover:border-blue/40 hover:bg-card transition-all min-h-[160px]"
        >
          <div className="w-16 h-16 rounded-full bg-elevated/40 flex items-center justify-center mb-3">
            <Plus className="w-7 h-7 text-dim" />
          </div>
          <span className="text-[13px] text-dim font-medium">Add</span>
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add profile</DialogTitle>
            <DialogDescription className="text-[12px] text-dim">
              Enter a YouTube channel handle to create a new profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">YouTube Handle</label>
              <input
                type="text"
                value={addHandle}
                onChange={(e) => { setAddHandle(e.target.value); setAddError(""); }}
                placeholder="@handle"
                className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40"
                autoFocus
              />
            </div>
            {addError && <p className="text-[11px] text-destructive">{addError}</p>}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setAddOpen(false)} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={addLoading}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {addLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Edit profile</DialogTitle>
            <DialogDescription className="text-[12px] text-dim">
              Update profile display name and color.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Name (Arabic)</label>
              <input
                type="text"
                value={editNameAr}
                onChange={(e) => setEditNameAr(e.target.value)}
                placeholder="Display name"
                className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40"
                dir="rtl"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Color</label>
              <div className="flex gap-2">
                {["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--orange))", "hsl(var(--destructive))", "hsl(var(--purple))", "#ec4899", "#06b6d4"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className={`w-8 h-8 rounded-full transition-all ${editColor === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-110"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setEditOpen(false)} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
            <button
              onClick={handleEdit}
              disabled={editLoading}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {editLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteProfile?.nameAr || deleteProfile?.handle}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
