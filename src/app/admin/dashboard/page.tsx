'use client';

import React, { useEffect, useState, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOutUser } from '@/lib/authService';
import {
  getPageDataForUser, addLinkToPage, deleteLinkFromPage, updateLinksOnPage,
  updatePageTheme, updatePageBackground, updateProfileImage, updatePageProfileInfo, updatePageCoupons,
  getAllUsers, getUpcomingAppointments, getAppointmentsByDate, updateAppointmentStatus, updateUserPlan,
  addLoyaltyPoint, getTransactionsByDate, addTransaction, deleteTransaction,
  PageData, LinkData, CouponData, AppointmentData, TransactionData
} from '@/lib/pageService';
import { 
  FaUserCog, FaSave, FaQrcode, FaTag, FaTrashAlt,
  FaMagic, FaPlus, FaCamera, FaCopy, FaExternalLinkAlt, FaLock, FaMapMarkerAlt, FaDoorOpen, FaDoorClosed, FaWhatsapp, FaKey, FaClock, FaSearch, FaCalendarAlt, FaCheck, FaTimes, FaList, FaMoneyBillWave, FaChartLine, FaWallet, FaHourglassHalf, FaCrown, FaToggleOn, FaToggleOff, FaStore, FaArrowLeft, FaCalendarDay, FaFileInvoiceDollar, FaArrowUp, FaArrowDown, FaGem, FaShieldAlt
} from 'react-icons/fa';
import Image from 'next/image';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ActionModal } from '@/components/ActionModal';
import { TransactionModal } from '@/components/TransactionModal';

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""; 
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('agenda');
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Lógica de Poder do Sábio
  const SUPER_ADMIN_EMAILS = ["claudesonborges@gmail.com"];
  const isSuperAdmin = userData?.isSuperAdmin || userData?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(user?.email || "");
  
  const [adminViewId, setAdminViewId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  // --- ESTADOS FINANCEIROS ---
  const [financialStart, setFinancialStart] = useState('');
  const [financialEnd, setFinancialEnd] = useState('');
  const [financialData, setFinancialData] = useState<AppointmentData[]>([]); 
  const [transactionsData, setTransactionsData] = useState<TransactionData[]>([]); 
  const [isLoadingFinancial, setIsLoadingFinancial] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false); 
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);
  const [confirmData, setConfirmData] = useState<{
     isOpen: boolean; title: string; desc: string; action: () => void; isDanger?: boolean; confirmText?: string;
  }>({ isOpen: false, title: '', desc: '', action: () => {} });

  // --- ESTADOS DE EDIÇÃO DE SERVIÇOS ---
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCat, setNewItemCat] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [newItemDuration, setNewItemDuration] = useState('30');
  const [isUploadingItemImg, setIsUploadingItemImg] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // --- ESTADOS PERFIL ---
  const [editingProfileTitle, setEditingProfileTitle] = useState('');
  const [editingProfileBio, setEditingProfileBio] = useState('');
  const [editingProfileAddress, setEditingProfileAddress] = useState('');
  const [editingProfileWhatsapp, setEditingProfileWhatsapp] = useState('');
  const [editingProfilePix, setEditingProfilePix] = useState('');
  const [isOpenStore, setIsOpenStore] = useState(true);
  
  const [schedOpen, setSchedOpen] = useState('09:00');
  const [schedClose, setSchedClose] = useState('19:00');
  const [schedLunchStart, setSchedLunchStart] = useState('');
  const [schedLunchEnd, setSchedLunchEnd] = useState('');
  const [schedDays, setSchedDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); 
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  
  const isProPlan = (pageData?.plan === 'pro' || (pageData as any)?.isPro === true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3000);
  };

  // --- MEMOS FINANCEIROS ---
  const reportStats = React.useMemo(() => {
    const incomeApps = financialData.filter(a => a.status === 'completed').reduce((acc, c) => acc + (c.totalValue || 0), 0);
    const incomeManual = transactionsData.filter(t => t.type === 'income').reduce((acc, c) => acc + (c.value || 0), 0);
    const totalRevenue = incomeApps + incomeManual;
    const totalExpenses = transactionsData.filter(t => t.type === 'expense').reduce((acc, c) => acc + (c.value || 0), 0);
    return { totalRevenue, totalExpenses, profit: totalRevenue - totalExpenses };
  }, [financialData, transactionsData]);

  const mergedFinancial = React.useMemo(() => {
      const apps = financialData.map(a => ({ id: a.id, date: (a.startAt as any).toDate ? (a.startAt as any).toDate() : new Date(a.startAt as any), desc: `${a.serviceName} (${a.customerName})`, value: a.totalValue, type: 'income', status: a.status, category: 'Serviço', isApp: true }));
      const trans = transactionsData.map(t => ({ id: t.id, date: (t.date as any).toDate ? (t.date as any).toDate() : new Date(t.date as any), desc: t.description, value: t.value, type: t.type, status: 'completed', category: t.category, isApp: false }));
      return [...apps, ...trans].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [financialData, transactionsData]);

  // --- FUNÇÕES DE BUSCA ---
  const fetchPageData = useCallback(async () => {
    const idToFetch = adminViewId || user?.uid; 
    if (idToFetch) {
      setIsLoadingData(true);
      try {
          const result = await getPageDataForUser(idToFetch);
          if (result) {
            const data = result.data as PageData;
            setPageData(data); setPageSlug(result.slug);
            setEditingProfileTitle(data.title || ''); setEditingProfileBio(data.bio || '');
            setEditingProfileAddress(data.address || '');
            let loadedWhats = (data as any).whatsapp || '';
            if (loadedWhats.startsWith('55')) loadedWhats = loadedWhats.substring(2);
            setEditingProfileWhatsapp(loadedWhats);
            setEditingProfilePix((data as any).pixKey || '');
            setIsOpenStore(data.isOpen !== false);
            if (data.schedule) {
                setSchedOpen(data.schedule.open || '09:00'); setSchedClose(data.schedule.close || '19:00');
                setSchedLunchStart(data.schedule.lunchStart || ''); setSchedLunchEnd(data.schedule.lunchEnd || '');
                setSchedDays(data.schedule.workingDays || [1, 2, 3, 4, 5, 6]);
            }
          }
      } catch (error) { console.error(error); } finally { setIsLoadingData(false); }
    }
  }, [user, adminViewId]); 

  const fetchUpcoming = useCallback(async () => {
      if (!pageSlug) return;
      setIsLoadingAppointments(true);
      const data = await getUpcomingAppointments(pageSlug);
      setAppointments(data);
      setIsLoadingAppointments(false);
  }, [pageSlug]);

  useEffect(() => { if (!loading && user) fetchPageData(); }, [user, loading, fetchPageData]);
  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [user, loading, router]);
  useEffect(() => { if (activeTab === 'agenda' && pageSlug) fetchUpcoming(); }, [activeTab, pageSlug, fetchUpcoming]);

  useEffect(() => {
    if (user && isSuperAdmin && activeTab === 'master') {
        getAllUsers().then(setAllUsers).catch(console.error);
    }
  }, [user, isSuperAdmin, activeTab]);

  useEffect(() => {
    const today = new Date();
    setFinancialStart(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
    setFinancialEnd(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]);
  }, []);

  // --- HANDLERS DE AÇÕES (CORRIGIDO) ---

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!pageSlug || !newItemTitle) return;
    const current = pageData?.links || [];
    if (!isProPlan && current.length >= 8) return showToast("Limite plano FREE atingido.", 'error');
    const newItem: LinkData = { title: newItemTitle, url: '', type: 'service', order: current.length + 1, clicks: 0, price: newItemPrice, description: newItemDesc, imageUrl: newItemImage, category: newItemCat, durationMinutes: parseInt(newItemDuration) || 30 };
    await addLinkToPage(pageSlug, newItem);
    setNewItemTitle(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemImage(''); setNewItemCat(''); setNewItemDuration('30');
    showToast("Procedimento adicionado!"); fetchPageData();
  };

  const handleDeleteItem = async (link: LinkData) => {
     setConfirmData({
         isOpen: true, title: "Remover", desc: `Apagar "${link.title}"?`, isDanger: true, confirmText: "Apagar",
         action: async () => { await deleteLinkFromPage(pageSlug!, link); fetchPageData(); showToast("Removido."); }
     })
  };

  const handleFetchFinancial = async () => {
    if (!pageSlug || !financialStart || !financialEnd) return;
    setIsLoadingFinancial(true);
    const start = new Date(financialStart + 'T00:00:00');
    const end = new Date(financialEnd + 'T23:59:59');
    setFinancialData(await getAppointmentsByDate(pageSlug, start, end));
    setTransactionsData(await getTransactionsByDate(pageSlug, start, end));
    setIsLoadingFinancial(false);
  };

  const handleDeleteTransaction = async (id: string) => {
    setConfirmData({
        isOpen: true, title: "Excluir Registro", desc: "Apagar movimentação?", isDanger: true, confirmText: "Apagar",
        action: async () => { await deleteTransaction(id); showToast("Removido."); handleFetchFinancial(); }
    });
  };

  const handleSaveProfile = async () => {
      if(!pageSlug) return;
      const whatsappToSave = editingProfileWhatsapp ? `55${editingProfileWhatsapp.replace(/\D/g, '')}` : '';
      const schedule = { open: schedOpen, close: schedClose, lunchStart: schedLunchStart, lunchEnd: schedLunchEnd, workingDays: schedDays };
      await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio, editingProfileAddress, isOpenStore, whatsappToSave, editingProfilePix, schedule);
      showToast("Perfil salvo!"); fetchPageData();
  };

  const handleStatusChange = async (id: string, newStatus: any, isFinancialTab = false, customerId?: string) => {
      setConfirmData({ isOpen: true, title: "Confirmar", desc: "Mudar status?", action: async () => {
          await updateAppointmentStatus(id, newStatus);
          showToast("Atualizado!");
          isFinancialTab ? handleFetchFinancial() : fetchUpcoming();
          if (newStatus === 'completed' && customerId && pageSlug) {
            setTimeout(() => setConfirmData({ isOpen: true, title: "Pontuar", desc: "Fidelizar cliente?", action: async () => { await addLoyaltyPoint(pageSlug, customerId); showToast("Pontuado!"); } }), 500);
          }
      }});
  };

  // --- UPLOADS ---
  const uploadToCloudinary = async (file: File) => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) return null;
    const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const data = await res.json(); return res.ok ? data.secure_url : null;
    } catch { return null; }
  };

  const handleProfileUpload = async (e: any) => {
    setIsUploadingProfile(true);
    const url = await uploadToCloudinary(e.target.files[0]);
    if(url && pageSlug) { await updateProfileImage(pageSlug, url); fetchPageData(); }
    setIsUploadingProfile(false);
  };

  const handleItemImageUpload = async (e: any) => {
    setIsUploadingItemImg(true);
    const url = await uploadToCloudinary(e.target.files[0]);
    if(url) setNewItemImage(url);
    setIsUploadingItemImg(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && pageData?.links) {
      setPageData((prev) => {
        if (!prev) return null;
        const currentIds = prev.links.map((l, i) => `item-${(l.title || 'item').replace(/[^a-zA-Z0-9]/g, '')}-${i}`);
        const oldIndex = currentIds.indexOf(String(active.id));
        const newIndex = currentIds.indexOf(String(over.id));
        if (oldIndex !== -1 && newIndex !== -1) {
            const newLinks = arrayMove(prev.links, oldIndex, newIndex);
            const reordered = newLinks.map((l, i) => ({ ...l, order: i + 1 }));
            if (pageSlug) updateLinksOnPage(pageSlug, reordered);
            return { ...prev, links: reordered };
        }
        return prev;
      });
    }
  };

  if (loading || isLoadingData) return <div className="flex h-screen items-center justify-center text-purple-600 font-bold animate-pulse font-sans">Carregando BeautyPro...</div>;

  return (
    <div className="min-h-screen bg-[#fdfaf9] pb-20 font-sans selection:bg-purple-100">
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} />
      <ActionModal isOpen={confirmData.isOpen} onClose={() => setConfirmData(prev => ({...prev, isOpen: false}))} onConfirm={confirmData.action} title={confirmData.title} description={confirmData.desc} isDanger={confirmData.isDanger} confirmText={confirmData.confirmText} />
      <TransactionModal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)} onSave={async (d) => { await addTransaction(d); handleFetchFinancial(); }} pageSlug={pageSlug!} services={pageData?.links || []} />
      
      {toast && ( <div className={`fixed top-4 right-4 z-70 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold animate-beauty flex items-center gap-3 ${toast.type === 'error' ? 'bg-red-500' : 'bg-purple-600'}`}> {toast.type === 'success' ? <FaCheck /> : <FaTimes />} {toast.msg} </div> )}

      <nav className="bg-white border-b border-purple-50 sticky top-0 z-20 px-6 h-20 flex justify-between items-center max-w-5xl mx-auto shadow-sm">
         <div className="flex items-center gap-2 text-2xl font-bold tracking-tighter">
            <div className="bg-linear-to-br from-purple-500 to-pink-500 text-white p-2 rounded-xl shadow-lg shadow-purple-200"><FaMagic size={18}/></div>
            <span className="text-gray-900">Beauty<span className="text-purple-500 font-light">Pro</span></span>
         </div>
         <div className="flex gap-4 items-center">
             {adminViewId && <button onClick={() => { setAdminViewId(null); fetchPageData(); }} className="bg-purple-600 text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase flex items-center gap-2 shadow-xl hover:bg-purple-700 transition active:scale-95"><FaArrowLeft/> Voltar ao Painel</button>}
             {pageSlug && <a href={`/${pageSlug}`} target="_blank" className="bg-purple-50 text-purple-600 p-3 rounded-full hover:bg-purple-100 transition shadow-sm"><FaExternalLinkAlt size={14}/></a>}
             <button onClick={signOutUser} className="text-gray-400 hover:text-red-500 transition font-bold text-sm">Sair</button>
         </div>
      </nav>

      <main className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        
        <div className="flex bg-gray-100 p-1.5 rounded-2xl overflow-x-auto shadow-inner">
            {[
              { id: 'agenda', label: 'Agenda', icon: <FaCalendarAlt/> },
              { id: 'financial', label: 'Financeiro', icon: <FaFileInvoiceDollar/> },
              { id: 'services', label: 'Serviços', icon: <FaList/> },
              { id: 'profile', label: 'Perfil', icon: <FaUserCog/> },
              ...(isSuperAdmin ? [{ id: 'master', label: 'Master', icon: <FaShieldAlt/> }] : [])
            ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 min-w-[100px] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all ${activeTab === t.id ? 'bg-white shadow-lg text-purple-600 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'}`}>
                    {t.icon} {t.label}
                </button>
            ))}
        </div>

        {activeTab === 'master' && isSuperAdmin && (
            <div className="animate-beauty space-y-8">
                <div className="bg-gray-900 p-10 rounded-[3rem] border border-purple-500/20 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"/>
                    <div className="relative z-10 space-y-4 mb-10">
                        <h3 className="text-3xl font-bold text-white font-serif-luxury italic flex items-center gap-3"><FaShieldAlt className="text-purple-400"/> Central do Sábio</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">Gestão Global do Ecossistema BeautyPro</p>
                    </div>
                    <div className="overflow-x-auto rounded-3xl border border-purple-900/20 bg-gray-900/50 backdrop-blur-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-800/50 text-gray-500 font-bold uppercase text-[9px] tracking-[0.2em]">
                                <tr><th className="p-5">Salão</th><th className="p-5">Email</th><th className="p-5">Plano</th><th className="p-5 text-right">Ações</th></tr>
                            </thead>
                            <tbody className="divide-y divide-purple-900/10">
                                {allUsers.map((u) => (
                                    <tr key={u.uid} className="hover:bg-purple-900/10 transition-colors">
                                        <td className="p-5"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center text-[10px] font-black text-purple-400 uppercase">{u.displayName?.charAt(0)}</div><span className="font-bold text-gray-200">{u.displayName || 'Sem Nome'}</span></div></td>
                                        <td className="p-5 text-gray-400 font-medium">{u.email}</td>
                                        <td className="p-5"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${u.plan === 'pro' ? 'bg-purple-600/20 text-purple-400 border-purple-600/30 shadow-lg' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>{u.plan || 'FREE'}</span></td>
                                        <td className="p-5 text-right flex gap-3 justify-end">
                                            <button onClick={() => { setAdminViewId(u.uid); setActiveTab('agenda'); }} className="p-3 bg-purple-600 text-white rounded-xl shadow-lg hover:bg-purple-500 transition active:scale-95" title="Gerenciar"><FaStore size={14}/></button>
                                            <button onClick={async () => { await updateUserPlan(u.uid, u.plan === 'pro' ? 'free' : 'pro'); getAllUsers().then(setAllUsers); showToast("Plano alterado!"); }} className={`p-3 rounded-xl border transition-all active:scale-95 ${u.plan === 'pro' ? 'border-red-500/30 text-red-500 bg-red-500/10' : 'border-green-500/30 text-green-500 bg-green-500/10'}`}>{u.plan === 'pro' ? <FaToggleOff size={16}/> : <FaToggleOn size={16}/>}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'agenda' && (
            <div className="animate-beauty space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-purple-50 shadow-sm"><p className="text-[9px] font-black uppercase text-gray-400 mb-2">Total</p><p className="text-2xl font-black text-gray-900 tracking-tighter">R$ {appointments.reduce((acc, c) => acc + (c.totalValue || 0), 0).toFixed(0)}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-purple-50 shadow-sm"><p className="text-[9px] font-black uppercase text-purple-400 mb-2">Pendente</p><p className="text-2xl font-black text-purple-600 tracking-tighter">R$ {appointments.filter(a => a.status === 'pending').reduce((acc, c) => acc + (c.totalValue || 0), 0).toFixed(0)}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-purple-50 shadow-sm"><p className="text-[9px] font-black uppercase text-pink-400 mb-2">Concluído</p><p className="text-2xl font-black text-pink-500 tracking-tighter">R$ {appointments.filter(a => a.status === 'completed').reduce((acc, c) => acc + (c.totalValue || 0), 0).toFixed(0)}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-purple-50 shadow-sm"><p className="text-[9px] font-black uppercase text-green-400 mb-2">Agenda</p><p className="text-2xl font-black text-green-500 tracking-tighter">{appointments.length}</p></div>
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50 min-h-[400px]">
                    <div className="flex justify-between items-center mb-8"><h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2"><FaCalendarDay className="text-purple-400"/> {adminViewId ? `Agenda de ${pageData?.title}` : 'Minha Agenda'}</h3><button onClick={fetchUpcoming} className="text-xs font-bold text-purple-600 hover:underline">Atualizar</button></div>
                    {isLoadingAppointments ? <div className="text-center py-20 text-purple-300 animate-pulse uppercase text-[10px] tracking-widest">Consultando...</div> : <div className="space-y-4">{appointments.length === 0 ? <p className="text-center text-gray-400 py-10 font-bold uppercase text-[10px] tracking-widest">Agenda Limpa</p> : appointments.map(app => {
                        let start; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                        return (
                            <div key={app.id} className="border border-purple-50 p-6 rounded-[2rem] flex flex-col gap-4 bg-[#fdfaf9]/50 hover:bg-white transition-all">
                                <div className="flex justify-between items-center"><div className="flex flex-col"><span className="text-lg font-black text-gray-900 tracking-tighter">{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{app.customerName}</span></div><span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-full border ${app.status === 'confirmed' ? 'bg-blue-50 text-blue-500 border-blue-100' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>{app.status}</span></div>
                                <div className="text-[11px] font-medium text-gray-500 leading-relaxed border-t border-purple-50/50 pt-4">{app.serviceName} • <span className="font-bold text-purple-600">R$ {app.totalValue.toFixed(2)}</span></div>
                                <div className="flex gap-3 mt-2">
                                    {app.status === 'pending' && <button onClick={() => handleStatusChange(app.id!, 'confirmed')} className="flex-1 bg-green-500 text-white p-3 rounded-2xl text-[10px] font-black uppercase">Confirmar</button>}
                                    {app.status === 'confirmed' && <button onClick={() => handleStatusChange(app.id!, 'completed', false, app.customerId)} className="flex-1 bg-purple-600 text-white p-3 rounded-2xl text-[10px] font-black uppercase">Concluir</button>}
                                    {app.status !== 'cancelled' && <button onClick={() => handleStatusChange(app.id!, 'cancelled')} className="bg-white border border-red-100 text-red-400 p-3 rounded-2xl text-[10px] font-black uppercase">Cancelar</button>}
                                </div>
                            </div>
                        )
                    })}</div>}
                </div>
            </div>
        )}

        {activeTab === 'financial' && (
           <div className="animate-beauty space-y-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50 flex flex-wrap gap-6 items-end justify-between">
                  <div className="flex flex-wrap gap-3 items-end">
                      <div className="space-y-1.5"><label className="text-[9px] font-black uppercase text-purple-300 ml-2">Início</label><input type="date" value={financialStart} onChange={e => setFinancialStart(e.target.value)} className="bg-gray-50 border border-purple-50 p-3 rounded-xl text-xs font-bold outline-none focus:border-purple-400" /></div>
                      <div className="space-y-1.5"><label className="text-[9px] font-black uppercase text-purple-300 ml-2">Fim</label><input type="date" value={financialEnd} onChange={e => setFinancialEnd(e.target.value)} className="bg-gray-50 border border-purple-50 p-3 rounded-xl text-xs font-bold outline-none focus:border-purple-400" /></div>
                      <button onClick={handleFetchFinancial} className="bg-gray-900 text-white p-3.5 rounded-xl font-bold shadow-lg hover:bg-black transition active:scale-95"><FaSearch /></button>
                  </div>
                  <button onClick={() => setIsTransactionModalOpen(true)} className="bg-green-500 text-white px-6 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl hover:bg-green-600 transition"><FaPlus /> Lançar PDV</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-white p-6 rounded-[2rem] border border-green-100 shadow-sm"><div className="text-green-500 text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-2"><FaArrowUp/> Entradas</div><div className="text-2xl font-black text-gray-900 tracking-tighter">R$ {reportStats.totalRevenue.toFixed(2)}</div></div>
                 <div className="bg-white p-6 rounded-[2rem] border border-red-100 shadow-sm"><div className="text-red-500 text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-2"><FaArrowDown/> Saídas</div><div className="text-2xl font-black text-gray-900 tracking-tighter">R$ {reportStats.totalExpenses.toFixed(2)}</div></div>
                 <div className="bg-gray-900 p-6 rounded-[2rem] border border-purple-900/20 shadow-2xl"><div className="text-purple-400 text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-2"><FaWallet/> Lucro Líquido</div><div className="text-2xl font-black text-white tracking-tighter">R$ {reportStats.profit.toFixed(2)}</div></div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50 overflow-hidden">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300 mb-8 ml-2">Extrato Detalhado</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-purple-50 text-[9px] font-black uppercase tracking-widest text-gray-400">
                            <tr><th className="p-4">Data</th><th className="p-4">Descrição</th><th className="p-4">Valor</th><th className="p-4 text-right">Ação</th></tr>
                        </thead>
                        <tbody className="divide-y divide-purple-50/30">
                            {mergedFinancial.map((item) => (
                                <tr key={item.id} className="hover:bg-[#fdfaf9] transition-colors group">
                                    <td className="p-4 text-[10px] font-bold text-gray-400">{item.date.toLocaleDateString('pt-BR')}</td>
                                    <td className="p-4"><p className="font-bold text-gray-800 text-sm">{item.desc}</p><span className="text-[9px] font-black text-purple-300 uppercase tracking-widest">{item.category}</span></td>
                                    <td className={`p-4 font-black text-sm ${item.type === 'income' ? 'text-green-500' : 'text-red-400'}`}>{item.type === 'expense' ? '-' : '+'} R$ {item.value.toFixed(2)}</td>
                                    <td className="p-4 text-right">{!item.isApp && <button onClick={() => handleDeleteTransaction(item.id!)} className="text-red-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><FaTrashAlt/></button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
              </div>
           </div>
        )}

        {activeTab === 'services' && (
             <div className="animate-beauty space-y-8">
                 {!isProPlan && ( <div onClick={() => setIsUpgradeModalOpen(true)} className="bg-gray-900 text-white p-8 rounded-[2.5rem] shadow-2xl border border-white/5 relative overflow-hidden group"> <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 duration-700"><FaCrown size={150}/></div> <div className="relative z-10"> <h3 className="font-black text-purple-400 uppercase tracking-widest text-xs flex items-center gap-2 mb-2"><FaCrown/> Plano Beauty Free</h3> <p className="text-sm text-gray-400 font-medium">Libere serviços ilimitados e fotos profissionais no seu cardápio.</p> </div> <button className="bg-purple-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl relative z-10">Ver Planos</button> </div> )}
                 <div className="bg-white p-8 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50"> <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-8 flex gap-2 items-center"><FaPlus className="text-green-500"/> Novo Procedimento</h3> <form onSubmit={handleAddItem} className="space-y-6"> <div className="flex flex-col sm:flex-row gap-6"> <div className="w-24 h-24 bg-purple-50 rounded-[1.5rem] border-2 border-dashed border-purple-100 flex items-center justify-center relative group"> {newItemImage ? <Image src={newItemImage} alt="Serviço" fill className="object-cover rounded-[1.5rem]" sizes="96px"/> : <FaCamera className="text-purple-200 text-xl"/>} <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleItemImageUpload} /> </div> <div className="flex-1 space-y-4"> <div className="flex gap-4"><input className="flex-1 bg-gray-50 border border-purple-50 p-4 rounded-2xl text-sm font-bold outline-none focus:border-purple-400" placeholder="Nome do Procedimento" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} required /><input className="w-32 bg-gray-50 border border-purple-50 p-4 rounded-2xl text-sm font-bold outline-none focus:border-purple-400" placeholder="Preço R$" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} /></div> <div className="flex gap-4"><input className="flex-1 bg-gray-50 border border-purple-50 p-4 rounded-2xl text-sm font-bold outline-none focus:border-purple-400" placeholder="Categoria" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} /><div className="flex items-center bg-gray-50 border border-purple-50 rounded-2xl px-4 w-32 shadow-inner"><FaClock className="text-purple-300 mr-2"/><input type="number" className="w-full bg-transparent p-4 text-xs font-bold outline-none" value={newItemDuration} onChange={e => setNewItemDuration(e.target.value)} /></div></div> </div> </div> <button type="submit" className="w-full bg-gray-900 text-white font-black py-5 rounded-[1.8rem] text-[10px] uppercase tracking-[0.3em] shadow-xl hover:bg-black transition active:scale-[0.98]">Adicionar Procedimento</button> </form> </div> <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}> <SortableContext items={pageData?.links?.map((l, i) => `item-${(l.title || 'item').replace(/[^a-zA-Z0-9]/g, '')}-${i}`) || []} strategy={verticalListSortingStrategy}> <div className="space-y-4"> {pageData?.links?.map((link, index) => ( <SortableLinkItem key={index} id={`item-${(link.title || 'item').replace(/[^a-zA-Z0-9]/g, '')}-${index}`} link={link} index={index} onEdit={()=>{}} onDelete={() => handleDeleteItem(link)} editingIndex={editingIndex} /> ))} </div> </SortableContext> </DndContext> 
             </div>
        )}

        {activeTab === 'profile' && (
             <div className="animate-beauty space-y-8">
                 <div className="bg-white p-8 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50 flex flex-col md:flex-row gap-8 items-start relative overflow-hidden">
                    <div className="relative group mx-auto md:mx-0">
                        <div className="w-32 h-32 rounded-full overflow-hidden border-[6px] border-purple-50 relative bg-purple-100 shadow-lg"> {pageData?.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="128px"/> : <FaCamera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-300 text-3xl"/>} </div>
                        <label className="absolute bottom-1 right-1 bg-purple-600 text-white p-3 rounded-full cursor-pointer shadow-xl hover:scale-110 transition active:scale-95"><FaCamera size={14}/><input type="file" className="hidden" onChange={handleProfileUpload}/></label>
                        {isUploadingProfile && <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center animate-pulse"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"/></div>}
                    </div>
                    <div className="flex-1 w-full space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-purple-300 uppercase tracking-widest ml-1">Nome do Salão</label><input value={editingProfileTitle} onChange={e=>setEditingProfileTitle(e.target.value)} className="w-full text-xl font-bold bg-gray-50 border border-purple-50 rounded-2xl p-4 outline-none focus:border-purple-400 shadow-inner" placeholder="Ex: Studio Beauty Lux"/></div>
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-purple-300 uppercase tracking-widest ml-1">WhatsApp de Atendimento</label><div className="flex items-center bg-gray-50 border border-purple-50 rounded-2xl px-4 py-4 focus-within:border-purple-400 transition shadow-inner"><span className="text-gray-400 font-bold mr-2 text-sm">+55</span><input value={editingProfileWhatsapp} onChange={e=>setEditingProfileWhatsapp(e.target.value)} className="bg-transparent outline-none w-full font-bold text-sm" placeholder="(00) 00000-0000"/></div></div>
                        </div>
                        <div className="space-y-1.5"><label className="text-[10px] font-black text-purple-300 uppercase tracking-widest ml-1">Biografia</label><textarea value={editingProfileBio} onChange={e=>setEditingProfileBio(e.target.value)} className="w-full text-sm bg-gray-50 border border-purple-50 rounded-2xl p-4 outline-none focus:border-purple-400 shadow-inner" rows={3} placeholder="Destaque seus rituais..."/></div>
                        
                        <div className="pt-4 border-t border-purple-50">
                            <div className="flex items-center justify-between mb-4"><label className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><FaQrcode/> Chave PIX (Para Checkout)</label>{!isProPlan && <span className="text-[9px] font-black bg-purple-100 text-purple-600 px-3 py-1 rounded-full uppercase">Plano PRO</span>}</div>
                            <div className={`relative ${!isProPlan ? 'opacity-40 grayscale pointer-events-none' : ''}`}><div className="flex items-center bg-gray-950 border border-purple-500/20 rounded-2xl px-4 py-4 shadow-2xl"><FaKey className="text-purple-500 mr-3"/><input value={editingProfilePix} onChange={e=>setEditingProfilePix(e.target.value)} className="bg-transparent outline-none w-full text-white font-bold text-sm" placeholder="Chave Pix (CPF, Celular ou Email)"/></div></div>
                        </div>

                        <button onClick={handleSaveProfile} className="w-full bg-linear-to-r from-purple-600 to-pink-500 text-white px-8 py-5 rounded-[1.8rem] font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-purple-900/30 hover:scale-[1.01] transition transform active:scale-95 flex items-center justify-center gap-3"><FaSave size={14}/> Salvar Configurações</button>
                    </div>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50 space-y-6"> <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2"><FaClock className="text-purple-400"/> Horários de Atendimento</h3> <div className="grid md:grid-cols-2 gap-8"> <div className="space-y-4"> <div className="flex gap-3"><input type="time" value={schedOpen} onChange={e => setSchedOpen(e.target.value)} className="flex-1 bg-gray-50 border border-purple-50 rounded-2xl p-4 font-bold text-center outline-none focus:border-purple-400 shadow-inner"/><input type="time" value={schedClose} onChange={e => setSchedClose(e.target.value)} className="flex-1 bg-gray-50 border border-purple-50 rounded-2xl p-4 font-bold text-center outline-none focus:border-purple-400 shadow-inner"/></div> </div> <div className="space-y-4"> <div className="flex flex-wrap gap-2"> {['D','S','T','Q','Q','S','S'].map((d, i) => ( <button key={i} onClick={() => setSchedDays(prev => prev.includes(i) ? prev.filter(day => day !== i) : [...prev, i].sort())} className={`w-10 h-10 rounded-xl font-black text-xs transition-all border ${schedDays.includes(i) ? 'bg-purple-600 border-purple-600 text-white shadow-lg' : 'bg-gray-50 border-purple-50 text-gray-400 hover:border-purple-200'}`}>{d}</button> ))} </div> </div> </div> </div>
             </div>
        )}

      </main>
      <a href="https://wa.me/5579996337995" target="_blank" className="fixed bottom-8 right-8 z-50 bg-green-500 text-white p-5 rounded-full shadow-[0_20px_50px_rgba(34,197,94,0.4)] transition hover:scale-110 group"><FaWhatsapp size={24} /><span className="absolute right-full mr-4 bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none">Suporte</span></a>
    </div>
  );
}