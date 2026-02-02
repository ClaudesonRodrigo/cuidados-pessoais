// src/app/admin/dashboard/page.tsx
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
  FaMagic, FaPlus, FaCamera, FaCopy, FaExternalLinkAlt, FaLock, FaMapMarkerAlt, FaDoorOpen, FaDoorClosed, FaWhatsapp, FaKey, FaClock, FaSearch, FaCalendarAlt, FaCheck, FaTimes, FaList, FaMoneyBillWave, FaChartLine, FaWallet, FaHourglassHalf, FaCrown, FaToggleOn, FaToggleOff, FaStore, FaArrowLeft, FaCalendarDay, FaFileInvoiceDollar, FaArrowUp, FaArrowDown, FaGem
} from 'react-icons/fa';
import Image from 'next/image';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';
import { QRCodeCanvas } from 'qrcode.react';
import FiscalModal from '@/components/FiscalModal';
import { UpgradeModal } from '@/components/UpgradeModal';
import { ActionModal } from '@/components/ActionModal';
import { TransactionModal } from '@/components/TransactionModal';

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""; 
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

const themes = [
  { name: 'dark', label: 'Beauty Dark', colorClass: 'bg-gray-900', isPro: false },
  { name: 'light', label: 'Clean White', colorClass: 'bg-gray-100', isPro: false },
  { name: 'ocean', label: 'Soft Blue', colorClass: 'bg-blue-900', isPro: true },
  { name: 'burger', label: 'Gold Elegance', colorClass: 'bg-yellow-600', isPro: true },
];

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('agenda');
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  
  const SUPER_ADMIN_EMAILS = ["claudesonborges@gmail.com"];
  const isAdmin = userData?.isSuperAdmin || userData?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(user?.email || "");
  const [adminViewId, setAdminViewId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  const [financialStart, setFinancialStart] = useState('');
  const [financialEnd, setFinancialEnd] = useState('');
  const [financialData, setFinancialData] = useState<AppointmentData[]>([]); 
  const [transactionsData, setTransactionsData] = useState<TransactionData[]>([]); 
  const [isLoadingFinancial, setIsLoadingFinancial] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);

  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false); 
  
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);
  const [confirmData, setConfirmData] = useState<{
     isOpen: boolean;
     title: string;
     desc: string;
     action: () => void;
     isDanger?: boolean;
     confirmText?: string;
  }>({ isOpen: false, title: '', desc: '', action: () => {} });

  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCat, setNewItemCat] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [newItemDuration, setNewItemDuration] = useState('30');
  const [isUploadingItemImg, setIsUploadingItemImg] = useState(false);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed'>('percent');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemCat, setEditItemCat] = useState('');
  const [editItemImage, setEditItemImage] = useState('');
  const [editItemDuration, setEditItemDuration] = useState('30');

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
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copiar Link');

  const isProPlan = (pageData?.plan === 'pro');
  const existingCategories = Array.from(new Set(pageData?.links?.map(l => l.category).filter(Boolean) || []));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const showToast = (msg: string, type: 'success'|'error'|'info' = 'success') => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3000);
  };

  const homeStats = React.useMemo(() => {
      const upcomingApps = appointments; 
      return {
          count: upcomingApps.length,
          pending: upcomingApps.filter(a => a.status === 'pending').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
          confirmed: upcomingApps.filter(a => a.status === 'confirmed').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
          completed: upcomingApps.filter(a => a.status === 'completed').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
          projected: upcomingApps.filter(a => a.status !== 'cancelled').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
      };
  }, [appointments]);

  const mergedFinancial = React.useMemo(() => {
      const apps = financialData.map(a => ({
          id: a.id,
          date: (a.startAt as any).toDate ? (a.startAt as any).toDate() : new Date(a.startAt as any),
          desc: `${a.serviceName} (${a.customerName})`,
          value: a.totalValue,
          type: 'income',
          status: a.status,
          category: 'Serviço',
          isApp: true
      }));

      const trans = transactionsData.map(t => ({
          id: t.id,
          date: (t.date as any).toDate ? (t.date as any).toDate() : new Date(t.date as any),
          desc: t.description,
          value: t.value,
          type: t.type,
          status: 'completed',
          category: t.category,
          isApp: false
      }));

      return [...apps, ...trans].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [financialData, transactionsData]);

  const reportStats = React.useMemo(() => {
    const incomeApps = financialData.filter(a => a.status === 'completed').reduce((acc, c) => acc + (c.totalValue || 0), 0);
    const incomeManual = transactionsData.filter(t => t.type === 'income').reduce((acc, c) => acc + (c.value || 0), 0);
    const totalRevenue = incomeApps + incomeManual;
    const totalExpenses = transactionsData.filter(t => t.type === 'expense').reduce((acc, c) => acc + (c.value || 0), 0);
    const profit = totalRevenue - totalExpenses;
    return { totalRevenue, totalExpenses, profit };
  }, [financialData, transactionsData]);

  const fetchPageData = useCallback(async () => {
    const idToFetch = adminViewId || user?.uid; 
    if (idToFetch) {
      setIsLoadingData(true);
      try {
          const result = await getPageDataForUser(idToFetch);
          if (result) {
            const data = result.data as PageData;
            if (data.links) data.links.sort((a, b) => (a.order || 0) - (b.order || 0));
            setPageData(data);
            setPageSlug(result.slug);
            setEditingProfileTitle(data.title || '');
            setEditingProfileBio(data.bio || '');
            setEditingProfileAddress(data.address || '');
            let loadedWhats = (data as any).whatsapp || '';
            if (loadedWhats.startsWith('55') && loadedWhats.length > 10) loadedWhats = loadedWhats.substring(2);
            setEditingProfileWhatsapp(loadedWhats);
            setEditingProfilePix((data as any).pixKey || '');
            setIsOpenStore(data.isOpen !== false);
            if (data.schedule) {
                setSchedOpen(data.schedule.open || '09:00');
                setSchedClose(data.schedule.close || '19:00');
                setSchedLunchStart(data.schedule.lunchStart || '');
                setSchedLunchEnd(data.schedule.lunchEnd || '');
                setSchedDays(data.schedule.workingDays || [1, 2, 3, 4, 5, 6]);
            } else setSchedDays([1, 2, 3, 4, 5, 6]);
            if (data.plan === 'pro' && data.trialDeadline) {
                const now = new Date();
                const deadline = data.trialDeadline.toDate();
                const diffTime = Math.abs(deadline.getTime() - now.getTime());
                setDaysLeft(now > deadline ? 0 : Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            } else setDaysLeft(null);
          }
      } catch (error) { console.error("Erro ao buscar dados:", error); } finally { setIsLoadingData(false); }
    }
  }, [user, adminViewId]); 

  const fetchUpcoming = useCallback(async () => {
      if (!pageSlug) return;
      setIsLoadingAppointments(true);
      try {
        const data = await getUpcomingAppointments(pageSlug);
        setAppointments(data);
      } catch (e) { console.error("Erro fetch agenda:", e); }
      setIsLoadingAppointments(false);
  }, [pageSlug]);

  const handleFetchFinancial = async () => {
    if (!pageSlug || !financialStart || !financialEnd) return showToast("Selecione o período", 'error');
    setIsLoadingFinancial(true);
    try {
      const start = new Date(financialStart + 'T00:00:00');
      const end = new Date(financialEnd + 'T23:59:59');
      const apps = await getAppointmentsByDate(pageSlug, start, end);
      setFinancialData(apps);
      const trans = await getTransactionsByDate(pageSlug, start, end);
      setTransactionsData(trans);
    } catch (e) { showToast("Erro no relatório.", 'error'); }
    setIsLoadingFinancial(false);
  };

  const handleSaveTransaction = async (data: TransactionData) => {
      if (!pageSlug) return;
      await addTransaction(data);
      showToast("Lançamento realizado!");
      handleFetchFinancial();
  };

  const handleDeleteTransaction = async (id: string) => {
      setConfirmData({
          isOpen: true, title: "Excluir Lançamento", desc: "Apagar este registro?", isDanger: true, confirmText: "Apagar",
          action: async () => { await deleteTransaction(id); showToast("Removido."); handleFetchFinancial(); }
      });
  };

  useEffect(() => {
      if (user && isAdmin) {
          const fetchAll = async () => {
              try {
                  const users = await getAllUsers();
                  setAllUsers(users);
              } catch (error) { console.error("Erro users:", error); }
          };
          fetchAll();
      }
  }, [user, isAdmin]);

  useEffect(() => { if (!loading && user) fetchPageData(); }, [user, loading, fetchPageData]);
  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [user, loading, router]);
  useEffect(() => { if (activeTab === 'agenda' && pageSlug) fetchUpcoming(); }, [activeTab, pageSlug, fetchUpcoming]);

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    setFinancialStart(firstDay.toISOString().split('T')[0]);
    setFinancialEnd(lastDay.toISOString().split('T')[0]);
  }, []);

  const handleAdminManage = (targetUid: string) => {
      setConfirmData({
          isOpen: true, title: "Gerenciar Conta", desc: "Acessar como Super Admin?",
          action: () => { setAdminViewId(targetUid); setActiveTab('profile'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
  };
  const handleExitAdminMode = () => { setAdminViewId(null); setActiveTab('agenda'); showToast("Saindo do modo admin.", 'info'); };
  
  const handleTogglePlan = async (targetUser: any) => {
      setConfirmData({
          isOpen: true, title: "Plano do Cliente", desc: `Mudar ${targetUser.displayName} para ${targetUser.plan === 'pro' ? 'FREE' : 'PRO'}?`,
          action: async () => {
             const newPlan = targetUser.plan === 'pro' ? 'free' : 'pro';
             await updateUserPlan(targetUser.uid, newPlan);
             setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? {...u, plan: newPlan} : u));
             showToast(`Plano atualizado.`);
          }
      });
  };

  const handleStatusChange = async (id: string, newStatus: 'confirmed' | 'cancelled' | 'completed', isFinancialTab = false, customerId?: string) => {
      setConfirmData({
          isOpen: true, title: "Atualizar Status", desc: "Confirmar alteração?", isDanger: newStatus === 'cancelled', confirmText: "Confirmar",
          action: async () => {
              await updateAppointmentStatus(id, newStatus);
              showToast("Status salvo!");
              if (isFinancialTab) handleFetchFinancial(); else fetchUpcoming();
              if (newStatus === 'completed' && customerId && pageSlug) {
                  setTimeout(() => {
                     setConfirmData({
                        isOpen: true, title: "✨ Fidelidade", desc: "Pontuar cliente?", confirmText: "Pontuar",
                        action: async () => { await addLoyaltyPoint(pageSlug, customerId); showToast("Ponto adicionado!"); }
                     });
                  }, 500);
              }
          }
      });
  };

  const uploadToCloudinary = async (file: File) => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) return null;
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        return res.ok ? data.secure_url : null;
    } catch { return null; }
  };

  const getUniqueId = (link: LinkData, index: number) => { const safeTitle = (link.title || 'item').replace(/[^a-zA-Z0-9]/g, ''); return `item-${safeTitle}-${index}`; };
  
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && pageData?.links) {
      setPageData((prev) => {
        if (!prev) return null;
        const currentIds = prev.links.map((l, i) => getUniqueId(l, i));
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

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!pageSlug || !newItemTitle) return;
    const current = pageData?.links || [];
    if (!isProPlan && current.length >= 8) return showToast("Limite atingido. Seja PRO!", 'error');
    const newItem: LinkData = { title: newItemTitle, url: '', type: 'service', order: current.length + 1, clicks: 0, price: newItemPrice, description: newItemDesc, imageUrl: newItemImage, category: newItemCat, durationMinutes: parseInt(newItemDuration) || 30 };
    await addLinkToPage(pageSlug, newItem);
    setNewItemTitle(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemImage(''); setNewItemCat(''); setNewItemDuration('30');
    showToast("Serviço adicionado!");
    fetchPageData();
  };

  const handleUpdateItem = async (index: number) => {
    if (!pageSlug || !pageData) return;
    const updated = [...pageData.links];
    updated[index] = { ...updated[index], title: editItemTitle, price: editItemPrice, description: editItemDesc, imageUrl: editItemImage, category: editItemCat, durationMinutes: parseInt(editItemDuration)||30 };
    await updateLinksOnPage(pageSlug, updated);
    setEditingIndex(null); showToast("Serviço atualizado!"); fetchPageData();
  };

  const toggleDay = (dayIndex: number) => { setSchedDays(prev => prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex].sort()); };
  const handleSaveProfile = async () => {
      if(!pageSlug) return;
      const whatsappToSave = editingProfileWhatsapp ? `55${editingProfileWhatsapp.replace(/\D/g, '')}` : '';
      const schedule = { open: schedOpen, close: schedClose, lunchStart: schedLunchStart, lunchEnd: schedLunchEnd, workingDays: schedDays };
      await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio, isProPlan ? editingProfileAddress : '', isOpenStore, whatsappToSave, isProPlan ? editingProfilePix : '', schedule);
      showToast("Perfil atualizado!"); fetchPageData();
  };
  const handleItemImageUpload = async (e: any, isNew: boolean) => { const url = await uploadToCloudinary(e.target.files[0]); if(url) isNew ? setNewItemImage(url) : setEditItemImage(url); setIsUploadingItemImg(false); };
  const handleProfileUpload = async (e: any) => { setIsUploadingProfile(true); const url = await uploadToCloudinary(e.target.files[0]); if(url && pageSlug) { await updateProfileImage(pageSlug, url); fetchPageData(); } setIsUploadingProfile(false); };
  const handleBgUpload = async (e: any) => { setIsUploadingBg(true); const url = await uploadToCloudinary(e.target.files[0]); if(url && pageSlug) { await updatePageBackground(pageSlug, url); fetchPageData(); } setIsUploadingBg(false); };
  const handleAddCoupon = async () => {
      if(!isProPlan || !pageSlug) return showToast("Recurso PRO.", 'info');
      const newC: CouponData = { code: newCouponCode.toUpperCase(), type: newCouponType, value: parseFloat(newCouponValue.replace(',','.')), active: true };
      const list = [...(pageData?.coupons||[]), newC];
      await updatePageCoupons(pageSlug, list);
      showToast("Cupom criado!"); fetchPageData();
  };
  const handleDeleteItem = async (link: LinkData) => {
     setConfirmData({
         isOpen: true, title: "Remover Serviço", desc: `Apagar "${link.title}"?`, isDanger: true, confirmText: "Apagar",
         action: async () => { await deleteLinkFromPage(pageSlug!, link); fetchPageData(); showToast("Removido."); }
     })
  };

  if (loading || isLoadingData) return <div className="flex h-screen items-center justify-center text-purple-600 font-bold">Carregando BeautyPro...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans relative">
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} />
      <FiscalModal isOpen={isFiscalModalOpen} onClose={() => setIsFiscalModalOpen(false)} onSave={() => {}} />
      <ActionModal isOpen={confirmData.isOpen} onClose={() => setConfirmData(prev => ({...prev, isOpen: false}))} onConfirm={confirmData.action} title={confirmData.title} description={confirmData.desc} isDanger={confirmData.isDanger} confirmText={confirmData.confirmText} />
      
      <TransactionModal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)} onSave={handleSaveTransaction} pageSlug={pageSlug!} services={pageData?.links || []} />

      {toast && ( <div className={`fixed top-4 right-4 z-70 px-6 py-3 rounded-xl shadow-2xl text-white font-bold animate-fade-in-down flex items-center gap-2 ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'info' ? 'bg-blue-500' : 'bg-purple-600'}`}> {toast.type === 'success' && <FaCheck />} {toast.type === 'error' && <FaTimes />} {toast.msg} </div> )}

      <nav className="bg-white shadow-sm sticky top-0 z-20 px-4 h-16 flex justify-between items-center max-w-4xl mx-auto">
         <h1 className="font-bold text-gray-800 flex gap-2 items-center"><FaMagic className="text-purple-500"/> BeautyPro</h1>
         <div className="flex gap-4 items-center">
             {!isProPlan && ( <button onClick={() => setIsUpgradeModalOpen(true)} className="hidden md:flex items-center gap-2 bg-linear-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:shadow-lg transition animate-pulse"> <FaCrown className="text-yellow-300"/> Seja PRO </button> )}
             {pageSlug && <a href={`/${pageSlug}`} target="_blank" className="text-sm font-bold text-purple-600 hover:underline flex items-center gap-1"><FaExternalLinkAlt/> Minha Página</a>}
             <button onClick={signOutUser} className="text-red-500 text-sm font-medium">Sair</button>
         </div>
      </nav>

      {adminViewId && ( <div className="bg-purple-700 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-16 z-30"> <span className="font-bold flex items-center gap-2 text-sm"> <FaGem className="animate-pulse"/> SUPER ADMIN: Editando {pageData?.title} </span> <button onClick={handleExitAdminMode} className="bg-white text-purple-700 text-xs font-bold px-4 py-2 rounded-full hover:bg-gray-100 flex items-center gap-2 transition"><FaArrowLeft/> Sair do Modo Admin</button> </div> )}

      <main className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        
        <div className="flex bg-gray-200 p-1 rounded-xl overflow-x-auto">
            {['agenda', 'financial', 'services', 'profile'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === t ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    {t === 'agenda' && <><FaCalendarAlt/> Agenda</>}
                    {t === 'financial' && <><FaFileInvoiceDollar/> Financeiro</>}
                    {t === 'services' && <><FaList/> Serviços</>}
                    {t === 'profile' && <><FaUserCog/> Perfil</>}
                </button>
            ))}
        </div>

        {activeTab === 'agenda' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm"><div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1"><FaChartLine/> Estimado</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.projected.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-yellow-400 shadow-sm"><div className="flex items-center gap-2 text-yellow-600 text-xs font-bold uppercase mb-1"><FaHourglassHalf/> Pendente</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.pending.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm"><div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase mb-1"><FaWallet/> Confirmado</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.confirmed.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm"><div className="flex items-center gap-2 text-green-600 text-xs font-bold uppercase mb-1"><FaMoneyBillWave/> Concluído</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.completed.toFixed(2)}</div></div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
                    <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-gray-800 text-lg">Próximos atendimentos</h3><button onClick={fetchUpcoming} className="text-sm text-purple-600 hover:underline">Atualizar</button></div>
                    {isLoadingAppointments ? <div className="text-center py-10">Buscando agenda...</div> : <div className="space-y-4">{appointments.length === 0 ? <p className="text-center text-gray-400 py-10">Nenhum atendimento agendado.</p> : appointments.map(app => {
                        let start; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                        return (
                            <div key={app.id} className="border p-4 rounded-xl flex flex-col gap-2 bg-gray-50">
                                <div className="flex justify-between font-bold"><span>{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - {app.customerName}</span> <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${app.status === 'confirmed' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200'}`}>{app.status}</span></div>
                                <div className="text-xs text-gray-500">{start.toLocaleDateString('pt-BR')} • {app.serviceName} • R$ {app.totalValue.toFixed(2)}</div>
                                <div className="flex gap-2 mt-2">
                                    {app.status === 'pending' && <button onClick={() => handleStatusChange(app.id!, 'confirmed')} className="flex-1 bg-green-600 text-white p-2 rounded text-xs font-bold">Confirmar</button>}
                                    {app.status === 'confirmed' && <button onClick={() => handleStatusChange(app.id!, 'completed', false, app.customerId)} className="flex-1 bg-purple-600 text-white p-2 rounded text-xs font-bold">Concluir</button>}
                                    {app.status !== 'cancelled' && <button onClick={() => handleStatusChange(app.id!, 'cancelled')} className="bg-white border border-red-300 text-red-500 p-2 rounded text-xs font-bold">Cancelar</button>}
                                </div>
                            </div>
                        )
                    })}</div>}
                </div>
            </div>
        )}

        {activeTab === 'financial' && (
           <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end justify-between">
                  <div className="flex flex-wrap gap-2 items-end">
                      <input type="date" value={financialStart} onChange={e => setFinancialStart(e.target.value)} className="border p-2 rounded text-sm outline-none" />
                      <input type="date" value={financialEnd} onChange={e => setFinancialEnd(e.target.value)} className="border p-2 rounded text-sm outline-none" />
                      <button onClick={handleFetchFinancial} className="bg-gray-800 text-white px-4 py-2 rounded font-bold text-sm h-[38px]"><FaSearch /></button>
                  </div>
                  <button onClick={() => setIsTransactionModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded font-bold text-sm h-[38px] flex items-center gap-2"><FaPlus /> Lançar PDV</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
                    <div className="text-green-600 text-xs font-bold uppercase mb-1"><FaArrowUp/> Entradas</div>
                    <div className="text-2xl font-bold text-green-800">R$ {reportStats.totalRevenue.toFixed(2)}</div>
                 </div>
                 <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                    <div className="text-red-600 text-xs font-bold uppercase mb-1"><FaArrowDown/> Saídas</div>
                    <div className="text-2xl font-bold text-red-800">R$ {reportStats.totalExpenses.toFixed(2)}</div>
                 </div>
                 <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
                    <div className="text-purple-600 text-xs font-bold uppercase mb-1"><FaWallet/> Saldo</div>
                    <div className="text-2xl font-bold text-purple-800">R$ {reportStats.profit.toFixed(2)}</div>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
                      <tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Valor</th><th className="p-3 text-right">Ação</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {mergedFinancial.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="p-3 text-xs">{item.date.toLocaleDateString('pt-BR')}</td>
                          <td className="p-3">
                              <p className="font-bold text-gray-800">{item.desc}</p>
                              <span className="text-[10px] text-gray-400 uppercase">{item.category}</span>
                          </td>
                          <td className={`p-3 font-bold ${item.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                              {item.type === 'expense' ? '-' : '+'} R$ {item.value.toFixed(2)}
                          </td>
                          <td className="p-3 text-right">
                              {!item.isApp && <button onClick={() => handleDeleteTransaction(item.id!)} className="text-red-400"><FaTrashAlt/></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
           </div>
        )}

        {activeTab === 'services' && (
             <div className="space-y-6">
                 {!isProPlan && ( <div onClick={() => setIsUpgradeModalOpen(true)} className="bg-gray-900 text-white p-4 rounded-xl shadow-lg cursor-pointer flex justify-between items-center"> <div> <h3 className="font-bold text-pink-400 flex items-center gap-2"><FaCrown/> Plano Beauty Free</h3> <p className="text-xs text-gray-400">Libere serviços ilimitados e fotos</p> </div> <button className="bg-purple-600 px-3 py-1 rounded text-xs font-bold">Ver Planos</button> </div> )}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"> <h3 className="font-bold text-gray-800 mb-4 flex gap-2 items-center"><FaPlus className="text-green-500"/> Novo Procedimento</h3> <form onSubmit={handleAddItem} className="space-y-4"> <div className="flex flex-col sm:flex-row gap-4"> <div className="w-20 h-20 bg-gray-50 rounded border-2 border-dashed flex items-center justify-center relative"> {newItemImage ? <Image src={newItemImage} alt="Serviço" fill className="object-cover rounded" sizes="80px"/> : <FaCamera className="text-gray-400"/>} <input type="file" className="absolute inset-0 opacity-0" onChange={(e) => handleItemImageUpload(e, true)} /> </div> <div className="flex-1 space-y-3"> <div className="flex gap-2"><input className="flex-1 border p-2 rounded text-sm" placeholder="Ex: Escova Progressiva" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} required /><input className="w-24 border p-2 rounded text-sm" placeholder="Preço" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} /></div> <div className="flex gap-2"><input className="w-full border p-2 rounded text-sm" placeholder="Categoria (ex: Cabelo)" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} /><div className="flex items-center border rounded px-2 w-32 bg-gray-50"><FaClock className="text-gray-400 mr-2"/><input type="number" className="w-full bg-transparent p-2 text-sm" value={newItemDuration} onChange={e => setNewItemDuration(e.target.value)} /></div></div> </div> </div> <button type="submit" className="w-full bg-purple-600 text-white font-bold py-2 rounded transition hover:bg-purple-700">Adicionar Serviço</button> </form> </div> <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}> <SortableContext items={pageData?.links?.map((l, i) => getUniqueId(l, i)) || []} strategy={verticalListSortingStrategy}> <div className="space-y-3"> {pageData?.links?.map((link, index) => ( <SortableLinkItem key={getUniqueId(link, index)} id={getUniqueId(link, index)} link={link} index={index} onEdit={()=>{setEditingIndex(index); setEditItemTitle(link.title); setEditItemPrice(link.price||''); setEditItemDuration(String(link.durationMinutes||30)); setEditItemCat(link.category||''); setEditItemImage(link.imageUrl||'');}} onDelete={() => handleDeleteItem(link)} editingIndex={editingIndex} /> ))} </div> </SortableContext> </DndContext> 
             </div>
        )}

        {activeTab === 'profile' && (
             <div className="space-y-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start"> <div className="relative w-24 h-24 mx-auto md:mx-0"> <div className="w-full h-full rounded-full overflow-hidden border-4 border-gray-100 relative bg-gray-200"> {pageData?.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="96px"/> : <FaCamera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400"/>} </div> <label className="absolute bottom-0 right-0 bg-purple-600 text-white p-2 rounded-full cursor-pointer shadow-lg"><FaCamera size={12}/><input type="file" className="hidden" onChange={handleProfileUpload}/></label> </div> <div className="flex-1 w-full space-y-3"> <input value={editingProfileTitle} onChange={e=>setEditingProfileTitle(e.target.value)} className="w-full text-lg font-bold border-b outline-none focus:border-purple-500" placeholder="Nome do Salão"/> <textarea value={editingProfileBio} onChange={e=>setEditingProfileBio(e.target.value)} className="w-full text-sm border rounded p-2 outline-none" rows={2} placeholder="Bio do Salão"/> <div className="flex items-center border rounded px-3 py-2 bg-gray-50"><FaWhatsapp className="text-green-500 mr-2"/> +55 <input value={editingProfileWhatsapp} onChange={e=>setEditingProfileWhatsapp(e.target.value)} className="bg-transparent outline-none ml-2 w-full" placeholder="WhatsApp"/></div> <div className="grid grid-cols-2 gap-2"> <input type="time" value={schedOpen} onChange={e => setSchedOpen(e.target.value)} className="border p-2 rounded text-sm bg-gray-50"/><input type="time" value={schedClose} onChange={e => setSchedClose(e.target.value)} className="border p-2 rounded text-sm bg-gray-50"/> </div> <button onClick={handleSaveProfile} className="bg-purple-600 text-white px-4 py-2 rounded font-bold w-full shadow-lg shadow-purple-900/20"><FaSave/> Salvar Perfil</button> </div> </div>
             </div>
        )}

        {isAdmin && !adminViewId && (
            <div className="mt-12 bg-gray-950 text-white p-6 rounded-xl border border-gray-800">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-purple-400"><FaCrown/> Central do Sábio (SaaS)</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-900 text-gray-500 font-bold uppercase text-[10px]">
                            <tr><th className="p-3">Dono</th><th className="p-3">Email</th><th className="p-3">Plano</th><th className="p-3 text-right">Ação</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-900">
                            {allUsers.map((u) => (
                                <tr key={u.uid} className="hover:bg-gray-900/50">
                                    <td className="p-3 font-bold">{u.displayName || 'Sem Nome'}</td>
                                    <td className="p-3 text-gray-400">{u.email}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${u.plan === 'pro' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                                            {(u.plan || 'FREE').toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right flex gap-2 justify-end">
                                        <button onClick={() => handleAdminManage(u.uid)} className="p-2 bg-purple-900/30 text-purple-400 rounded transition hover:bg-purple-900/50" title="Gerenciar"><FaStore/></button>
                                        <button onClick={() => handleTogglePlan(u)} className={`p-2 rounded transition ${u.plan === 'pro' ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}> {u.plan === 'pro' ? <FaToggleOff/> : <FaToggleOn/>} </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

      </main>
      <a href="https://wa.me/5579996337995" target="_blank" className="fixed bottom-6 right-6 z-50 bg-green-500 text-white p-4 rounded-full shadow-2xl transition hover:scale-110"> <FaWhatsapp size={24} /> </a>
    </div>
  );
}