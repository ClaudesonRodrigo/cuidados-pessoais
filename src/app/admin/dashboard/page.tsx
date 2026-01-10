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
  FaCut, FaPlus, FaCamera, FaCopy, FaExternalLinkAlt, FaLock, FaMapMarkerAlt, FaDoorOpen, FaDoorClosed, FaWhatsapp, FaKey, FaClock, FaSearch, FaCalendarAlt, FaCheck, FaTimes, FaList, FaMoneyBillWave, FaChartLine, FaWallet, FaHourglassHalf, FaCrown, FaToggleOn, FaToggleOff, FaStore, FaArrowLeft, FaMagic, FaCalendarDay, FaFileInvoiceDollar, FaArrowUp, FaArrowDown
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

// Configurações (Ambiente)
const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""; 
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

// Temas
const themes = [
  { name: 'dark', label: 'Barber Dark', colorClass: 'bg-gray-900', isPro: false },
  { name: 'light', label: 'Clean', colorClass: 'bg-gray-100', isPro: false },
  { name: 'ocean', label: 'Blue', colorClass: 'bg-blue-900', isPro: true },
  { name: 'burger', label: 'Gold', colorClass: 'bg-yellow-600', isPro: true },
];

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  // Controle de Abas
  const [activeTab, setActiveTab] = useState('agenda');

  // Dados Principais
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  
  // Super Admin
  const SUPER_ADMIN_EMAILS = ["claudesonborges@gmail.com"];
  const isAdmin = userData?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(user?.email || "");
  const [adminViewId, setAdminViewId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Agenda (Home)
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  // Financeiro / Histórico (PDV)
  const [financialStart, setFinancialStart] = useState('');
  const [financialEnd, setFinancialEnd] = useState('');
  const [financialData, setFinancialData] = useState<AppointmentData[]>([]); // Agendamentos
  const [transactionsData, setTransactionsData] = useState<TransactionData[]>([]); // Vendas/Despesas Manuais
  const [isLoadingFinancial, setIsLoadingFinancial] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false); // Modal PDV

  // Modais e UI
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false); 
  
  // --- SISTEMA DE TOAST E CONFIRMAÇÃO ---
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);
  const [confirmData, setConfirmData] = useState<{
     isOpen: boolean;
     title: string;
     desc: string;
     action: () => void;
     isDanger?: boolean;
     confirmText?: string;
  }>({ isOpen: false, title: '', desc: '', action: () => {} });

  // Formulários Serviço
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

  // Edição Serviço
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemCat, setEditItemCat] = useState('');
  const [editItemImage, setEditItemImage] = useState('');
  const [editItemDuration, setEditItemDuration] = useState('30');

  // Perfil
  const [editingProfileTitle, setEditingProfileTitle] = useState('');
  const [editingProfileBio, setEditingProfileBio] = useState('');
  const [editingProfileAddress, setEditingProfileAddress] = useState('');
  const [editingProfileWhatsapp, setEditingProfileWhatsapp] = useState('');
  const [editingProfilePix, setEditingProfilePix] = useState('');
  const [isOpenStore, setIsOpenStore] = useState(true);
  
  // Configuração de Horários
  const [schedOpen, setSchedOpen] = useState('09:00');
  const [schedClose, setSchedClose] = useState('19:00');
  const [schedLunchStart, setSchedLunchStart] = useState('');
  const [schedLunchEnd, setSchedLunchEnd] = useState('');
  const [schedDays, setSchedDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); 

  // UI
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copiar Link');

  // Helpers
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

  // Stats Financeiros
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

  // Merge de Dados Financeiros
  const mergedFinancial = React.useMemo(() => {
      const apps = financialData.map(a => ({
          id: a.id,
          date: (a.startAt as any).toDate ? (a.startAt as any).toDate() : new Date(a.startAt as any),
          desc: `${a.serviceName} (${a.customerName})`,
          value: a.totalValue,
          type: 'income',
          status: a.status,
          category: 'Agendamento',
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

  // --- DATA FETCHING ---
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
          } else if (adminViewId) {
                showToast("Usuário sem página configurada.", 'error');
                setAdminViewId(null);
                setActiveTab('agenda');
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
    if (!pageSlug || !financialStart || !financialEnd) return showToast("Selecione data inicial e final", 'error');
    setIsLoadingFinancial(true);
    try {
      const start = new Date(financialStart + 'T00:00:00');
      const end = new Date(financialEnd + 'T23:59:59');
      const apps = await getAppointmentsByDate(pageSlug, start, end);
      setFinancialData(apps);
      const trans = await getTransactionsByDate(pageSlug, start, end);
      setTransactionsData(trans);
    } catch (e) {
      console.error("Erro financeiro:", e);
      showToast("Erro ao buscar relatório.", 'error');
    }
    setIsLoadingFinancial(false);
  };

  const handleSaveTransaction = async (data: TransactionData) => {
      if (!pageSlug) return;
      await addTransaction(data);
      showToast("Movimentação registrada!", 'success');
      handleFetchFinancial();
  };

  const handleDeleteTransaction = async (id: string) => {
      setConfirmData({
          isOpen: true,
          title: "Excluir Lançamento",
          desc: "Tem certeza que deseja apagar este lançamento manual?",
          isDanger: true,
          confirmText: "Apagar",
          action: async () => {
              await deleteTransaction(id);
              showToast("Lançamento removido.", 'success');
              handleFetchFinancial();
          }
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
          isOpen: true, title: "Acessar Painel", desc: "Entrar como Super Admin?",
          action: () => { setAdminViewId(targetUid); setActiveTab('profile'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
  };
  const handleExitAdminMode = () => { setAdminViewId(null); setActiveTab('agenda'); showToast("Modo Admin encerrado.", 'info'); };
  
  const handleTogglePlan = async (targetUser: any) => {
      setConfirmData({
          isOpen: true, title: "Alterar Plano", desc: "Mudar plano?",
          action: async () => {
             const newPlan = targetUser.plan === 'pro' ? 'free' : 'pro';
             await updateUserPlan(targetUser.uid, newPlan);
             setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? {...u, plan: newPlan} : u));
             showToast(`Plano alterado para ${newPlan.toUpperCase()}`);
          }
      });
  };

  const handleStatusChange = async (id: string, newStatus: 'confirmed' | 'cancelled' | 'completed', isFinancialTab = false, customerId?: string) => {
      setConfirmData({
          isOpen: true, title: "Confirmar Alteração", desc: "Alterar status?", isDanger: newStatus === 'cancelled', confirmText: "Sim, alterar",
          action: async () => {
              await updateAppointmentStatus(id, newStatus);
              showToast("Status atualizado!");
              if (isFinancialTab) handleFetchFinancial(); else fetchUpcoming();
              if (newStatus === 'completed' && customerId && pageSlug) {
                  setTimeout(() => {
                     setConfirmData({
                        isOpen: true, title: "🎟️ Cartão Fidelidade", desc: "Pontuar cliente?", confirmText: "Pontuar",
                        action: async () => { await addLoyaltyPoint(pageSlug, customerId); showToast("Ponto adicionado!", 'success'); }
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
        formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        return res.ok ? data.secure_url : null;
    } catch { return null; }
  };

  const getUniqueId = (link: LinkData, index: number) => { const safeTitle = (link.title || 'untitled').replace(/[^a-zA-Z0-9]/g, ''); return `item-${safeTitle}-${index}`; };
  
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
    if (!isProPlan && current.length >= 8) return showToast("Limite Free atingido. Vire PRO!", 'error');
    const newItem: LinkData = { title: newItemTitle, url: '', type: 'service', order: current.length + 1, clicks: 0, price: newItemPrice, description: newItemDesc, imageUrl: newItemImage, category: newItemCat, durationMinutes: parseInt(newItemDuration) || 30 };
    await addLinkToPage(pageSlug, newItem);
    setNewItemTitle(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemImage(''); setNewItemCat(''); setNewItemDuration('30');
    showToast("Serviço adicionado!", 'success');
    fetchPageData();
  };

  const handleUpdateItem = async (index: number) => {
    if (!pageSlug || !pageData) return;
    const updated = [...pageData.links];
    updated[index] = { ...updated[index], title: editItemTitle, price: editItemPrice, description: editItemDesc, imageUrl: editItemImage, category: editItemCat, durationMinutes: parseInt(editItemDuration)||30 };
    await updateLinksOnPage(pageSlug, updated);
    setEditingIndex(null); showToast("Serviço atualizado!", 'success'); fetchPageData();
  };

  const toggleDay = (dayIndex: number) => { setSchedDays(prev => prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex].sort()); };
  const handleSaveProfile = async () => {
      if(!pageSlug) return;
      const whatsappToSave = editingProfileWhatsapp ? `55${editingProfileWhatsapp.replace(/\D/g, '')}` : '';
      const schedule = { open: schedOpen, close: schedClose, lunchStart: schedLunchStart, lunchEnd: schedLunchEnd, workingDays: schedDays };
      await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio, isProPlan ? editingProfileAddress : '', isOpenStore, whatsappToSave, isProPlan ? editingProfilePix : '', schedule);
      showToast("Perfil salvo com sucesso!", 'success'); fetchPageData();
  };
  const handleItemImageUpload = async (e: any, isNew: boolean) => { const url = await uploadToCloudinary(e.target.files[0]); if(url) isNew ? setNewItemImage(url) : setEditItemImage(url); setIsUploadingItemImg(false); };
  const handleProfileUpload = async (e: any) => { setIsUploadingProfile(true); const url = await uploadToCloudinary(e.target.files[0]); if(url && pageSlug) { await updateProfileImage(pageSlug, url); fetchPageData(); } setIsUploadingProfile(false); };
  const handleBgUpload = async (e: any) => { setIsUploadingBg(true); const url = await uploadToCloudinary(e.target.files[0]); if(url && pageSlug) { await updatePageBackground(pageSlug, url); fetchPageData(); } setIsUploadingBg(false); };
  const handleAddCoupon = async () => {
      if(!isProPlan || !pageSlug) return showToast("Recurso exclusivo PRO.", 'info');
      const newC: CouponData = { code: newCouponCode.toUpperCase(), type: newCouponType, value: parseFloat(newCouponValue.replace(',','.')), active: true };
      const list = [...(pageData?.coupons||[]), newC];
      await updatePageCoupons(pageSlug, list);
      setPageData(prev => prev ? {...prev, coupons: list} : null);
      showToast("Cupom criado!", 'success');
  };
  const handleDeleteItem = async (link: LinkData) => {
     setConfirmData({
         isOpen: true, title: "Excluir Serviço", desc: `Apagar "${link.title}"?`, isDanger: true, confirmText: "Apagar",
         action: async () => { await deleteLinkFromPage(pageSlug!, link); fetchPageData(); showToast("Serviço removido.", 'success'); }
     })
  };

  if (loading || isLoadingData) return <div className="flex h-screen items-center justify-center text-orange-600 font-bold">Carregando Painel...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans relative">
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} />
      <FiscalModal isOpen={isFiscalModalOpen} onClose={() => setIsFiscalModalOpen(false)} onSave={() => {}} />
      <ActionModal isOpen={confirmData.isOpen} onClose={() => setConfirmData(prev => ({...prev, isOpen: false}))} onConfirm={confirmData.action} title={confirmData.title} description={confirmData.desc} isDanger={confirmData.isDanger} confirmText={confirmData.confirmText} />
      
      {/* MODAL PDV */}
      <TransactionModal 
        isOpen={isTransactionModalOpen} 
        onClose={() => setIsTransactionModalOpen(false)} 
        onSave={handleSaveTransaction} 
        pageSlug={pageSlug!}
        services={pageData?.links || []}
      />

      {/* TOAST */}
      {toast && ( <div className={`fixed top-4 right-4 z-70 px-6 py-3 rounded-xl shadow-2xl text-white font-bold animate-fade-in-down flex items-center gap-2 ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'info' ? 'bg-blue-500' : 'bg-green-600'}`}> {toast.type === 'success' && <FaCheck />} {toast.type === 'error' && <FaTimes />} {toast.msg} </div> )}

      {/* NAV */}
      <nav className="bg-white shadow-sm sticky top-0 z-20 px-4 h-16 flex justify-between items-center max-w-4xl mx-auto">
         <h1 className="font-bold text-gray-800 flex gap-2 items-center"><FaCut className="text-orange-500"/> BarberPro</h1>
         <div className="flex gap-4 items-center">
             {!isProPlan && ( <button onClick={() => setIsUpgradeModalOpen(true)} className="hidden md:flex items-center gap-2 bg-linear-to-r from-orange-500 to-red-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:shadow-lg hover:scale-105 transition animate-pulse"> <FaCrown className="text-yellow-300"/> Seja PRO </button> )}
             {pageSlug && <a href={`/${pageSlug}`} target="_blank" className="text-sm font-bold text-orange-600 hover:underline flex items-center gap-1"><FaExternalLinkAlt/> Ver Loja</a>}
             <button onClick={signOutUser} className="text-red-500 text-sm font-medium">Sair</button>
         </div>
      </nav>

      {/* SUPER ADMIN MODE */}
      {adminViewId && ( <div className="bg-red-600 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-16 z-30"> <span className="font-bold flex items-center gap-2 text-sm md:text-base"> <FaMagic className="animate-pulse"/> MODO SUPER ADMIN: Editando {pageData?.title} </span> <button onClick={handleExitAdminMode} className="bg-white text-red-600 text-xs font-bold px-4 py-2 rounded-full hover:bg-gray-100 flex items-center gap-2 shadow-lg transition active:scale-95"><FaArrowLeft/> Sair do Modo Edição</button> </div> )}

      <main className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        
        {/* TABS */}
        <div className="flex bg-gray-200 p-1 rounded-xl overflow-x-auto">
            {['agenda', 'financial', 'services', 'profile'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 min-w-[100px] py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === t ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    {t === 'agenda' && <><FaCalendarAlt/> Agenda</>}
                    {t === 'financial' && <><FaFileInvoiceDollar/> Financeiro</>}
                    {t === 'services' && <><FaList/> Serviços</>}
                    {t === 'profile' && <><FaUserCog/> Perfil</>}
                </button>
            ))}
        </div>

        {/* AGENDA */}
        {activeTab === 'agenda' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm"><div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1"><FaChartLine/> Total Futuro</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.projected.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-yellow-400 shadow-sm"><div className="flex items-center gap-2 text-yellow-600 text-xs font-bold uppercase mb-1"><FaHourglassHalf/> A Receber</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.pending.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm"><div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase mb-1"><FaWallet/> Confirmado</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.confirmed.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm"><div className="flex items-center gap-2 text-green-600 text-xs font-bold uppercase mb-1"><FaMoneyBillWave/> Realizado</div><div className="text-2xl font-bold text-gray-800">R$ {homeStats.completed.toFixed(2)}</div></div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
                    <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-gray-800 text-lg">Próximos Agendamentos</h3><button onClick={fetchUpcoming} className="text-sm text-blue-600 hover:underline">Atualizar</button></div>
                    {isLoadingAppointments ? <div className="text-center py-10">Carregando...</div> : <div className="space-y-4">{appointments.length === 0 ? <p className="text-center text-gray-400 py-10">Agenda vazia.</p> : appointments.map(app => {
                        let start; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                        return (
                            <div key={app.id} className="border p-4 rounded-xl flex flex-col gap-2 bg-gray-50">
                                <div className="flex justify-between font-bold"><span>{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - {app.customerName}</span> <span className="text-xs px-2 py-1 bg-gray-200 rounded">{app.status}</span></div>
                                <div className="text-xs text-gray-500">{start.toLocaleDateString('pt-BR')} • {app.serviceName} • R$ {app.totalValue.toFixed(2)}</div>
                                <div className="flex gap-2 mt-2">
                                    {app.status === 'pending' && <button onClick={() => handleStatusChange(app.id!, 'confirmed')} className="flex-1 bg-green-600 text-white p-2 rounded text-xs font-bold">Confirmar Pagto</button>}
                                    {app.status === 'confirmed' && <button onClick={() => handleStatusChange(app.id!, 'completed', false, app.customerId)} className="flex-1 bg-blue-600 text-white p-2 rounded text-xs font-bold">Concluir</button>}
                                    {app.status !== 'cancelled' && <button onClick={() => handleStatusChange(app.id!, 'cancelled')} className="bg-white border border-red-300 text-red-500 p-2 rounded text-xs font-bold">Cancelar</button>}
                                </div>
                            </div>
                        )
                    })}</div>}
                </div>
            </div>
        )}

        {/* FINANCEIRO (TABELAS CORRIGIDAS AQUI) */}
        {activeTab === 'financial' && (
           <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end justify-between">
                  <div className="flex flex-wrap gap-4 items-end">
                      <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">Data Inicial</label>
                        <input type="date" value={financialStart} onChange={e => setFinancialStart(e.target.value)} className="border p-2 rounded text-sm outline-none focus:border-orange-500" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">Data Final</label>
                        <input type="date" value={financialEnd} onChange={e => setFinancialEnd(e.target.value)} className="border p-2 rounded text-sm outline-none focus:border-orange-500" />
                      </div>
                      <button onClick={handleFetchFinancial} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded font-bold h-[38px] flex items-center gap-2 transition">
                        <FaSearch /> Filtrar
                      </button>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                      <button onClick={() => setIsTransactionModalOpen(true)} className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold h-[38px] flex items-center justify-center gap-2 transition shadow-lg shadow-green-900/10">
                         <FaPlus /> Lançar Movimentação
                      </button>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
                    <div className="text-green-600 text-xs font-bold uppercase mb-1 flex items-center gap-2"><FaArrowUp/> Entradas (Vendas)</div>
                    <div className="text-2xl font-bold text-green-800">R$ {reportStats.totalRevenue.toFixed(2)}</div>
                    <div className="text-xs text-green-600 mt-1">Serviços + Produtos</div>
                 </div>
                 <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                    <div className="text-red-600 text-xs font-bold uppercase mb-1 flex items-center gap-2"><FaArrowDown/> Saídas (Despesas)</div>
                    <div className="text-2xl font-bold text-red-800">R$ {reportStats.totalExpenses.toFixed(2)}</div>
                    <div className="text-xs text-red-600 mt-1">Custos operacionais</div>
                 </div>
                 <div className={`p-4 rounded-xl border ${reportStats.profit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className={`${reportStats.profit >= 0 ? 'text-blue-600' : 'text-orange-600'} text-xs font-bold uppercase mb-1 flex items-center gap-2`}><FaWallet/> Lucro Líquido</div>
                    <div className={`text-2xl font-bold ${reportStats.profit >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>R$ {reportStats.profit.toFixed(2)}</div>
                    <div className={`text-xs ${reportStats.profit >= 0 ? 'text-blue-600' : 'text-orange-600'} mt-1`}>Entradas - Saídas</div>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><FaList/> Extrato de Movimentações</h3>
                  {isLoadingFinancial ? (
                    <div className="text-center py-10 text-gray-500">Buscando dados...</div>
                  ) : (
                    <div className="overflow-x-auto">
                       {mergedFinancial.length === 0 ? (
                         <div className="text-center py-8 text-gray-400">Nenhuma movimentação neste período.</div>
                       ) : (
                         <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                             <tr>
                               <th className="p-3 rounded-l-lg">Data</th>
                               <th className="p-3">Descrição</th>
                               <th className="p-3">Categoria</th>
                               <th className="p-3">Tipo</th>
                               <th className="p-3">Valor</th>
                               <th className="p-3 rounded-r-lg text-right">Ação</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100">
                             {mergedFinancial.map((item) => (
                                 <tr key={item.id} className="hover:bg-gray-50">
                                   <td className="p-3 font-medium text-gray-700">
                                     {item.date.toLocaleDateString('pt-BR')} <br/>
                                     <span className="text-xs text-gray-400">{item.date.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                   </td>
                                   <td className="p-3 font-bold text-gray-800">{item.desc}</td>
                                   <td className="p-3 text-gray-500 text-xs uppercase">{item.category}</td>
                                   <td className="p-3">
                                       <span className={`px-2 py-1 rounded text-xs font-bold ${item.type === 'income' ? (item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700') : 'bg-red-100 text-red-700'}`}>
                                           {item.type === 'income' ? 'ENTRADA' : 'SAÍDA'}
                                       </span>
                                   </td>
                                   <td className={`p-3 font-bold ${item.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                                       {item.type === 'expense' && '- '}R$ {item.value.toFixed(2)}
                                   </td>
                                   <td className="p-3 text-right">
                                       {!item.isApp ? (
                                           <button onClick={() => handleDeleteTransaction(item.id!)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition"><FaTrashAlt/></button>
                                       ) : (
                                           item.status !== 'completed' && item.status !== 'cancelled' ? (
                                              <div className="flex justify-end gap-1">
                                                 <button onClick={() => handleStatusChange(item.id!, 'completed', true)} title="Concluir" className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded"><FaCheck/></button>
                                                 <button onClick={() => handleStatusChange(item.id!, 'cancelled', true)} title="Cancelar" className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded"><FaTimes/></button>
                                              </div>
                                           ) : <span className="text-xs text-gray-400 italic">Fechado</span>
                                       )}
                                   </td>
                                 </tr>
                             ))}
                           </tbody>
                         </table>
                       )}
                    </div>
                  )}
              </div>
           </div>
        )}

        {/* SERVIÇOS */}
        {activeTab === 'services' && (
             <div className="space-y-6">
                 {!isProPlan && ( <div onClick={() => setIsUpgradeModalOpen(true)} className="bg-gray-900 text-white p-4 rounded-xl shadow-lg cursor-pointer border border-orange-500/30 flex justify-between items-center"> <div> <h3 className="font-bold text-orange-400 flex items-center gap-2"><FaCrown/> Plano Gratuito</h3> <p className="text-xs text-gray-400">Toque para desbloquear recursos VIP</p> </div> <button className="bg-orange-600 px-3 py-1 rounded text-xs font-bold">Ver Planos</button> </div> )}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"> <h3 className="font-bold text-gray-800 mb-4 flex gap-2 items-center"><FaPlus className="text-green-500"/> Novo Serviço</h3> <form onSubmit={handleAddItem} className="space-y-4"> <div className="flex flex-col sm:flex-row gap-4 items-start"> <div className="w-20 h-20 bg-gray-50 rounded border-2 border-dashed flex items-center justify-center relative cursor-pointer"> {newItemImage ? <Image src={newItemImage} alt="Serviço" fill className="object-cover rounded" sizes="80px"/> : <FaCamera className="text-gray-400"/>} <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleItemImageUpload(e, true)} /> {isUploadingItemImg && <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-xs">...</div>} </div> <div className="flex-1 w-full space-y-3"> <div className="flex gap-3"><input className="flex-1 border p-2 rounded text-sm" placeholder="Nome" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} required /><input className="w-24 border p-2 rounded text-sm" placeholder="$$" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} /></div> <div className="flex gap-3"><input className="w-full border p-2 rounded text-sm" placeholder="Categoria" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} list="cats" /><datalist id="cats">{existingCategories.map((c: any, i) => <option key={i} value={c}/>)}</datalist><div className="flex items-center border rounded px-2 w-32 bg-gray-50"><FaClock className="text-gray-400 mr-2"/><input type="number" className="w-full bg-transparent p-2 text-sm outline-none" value={newItemDuration} onChange={e => setNewItemDuration(e.target.value)} step="5" /></div></div> </div> </div> <button type="submit" className="w-full bg-green-600 text-white font-bold py-2 rounded">Adicionar</button> </form> </div> <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}> <SortableContext items={pageData?.links?.map((l, i) => getUniqueId(l, i)) || []} strategy={verticalListSortingStrategy}> <div className="space-y-3"> {pageData?.links?.map((link, index) => { const uniqueId = getUniqueId(link, index); if(editingIndex === index) return ( <div key={uniqueId} className="bg-orange-50 p-4 rounded border border-orange-200 space-y-2"> <p className="text-xs font-bold text-orange-800">Editando: {link.title}</p> <div className="flex gap-2"><input className="flex-1 border p-1 rounded text-sm" value={editItemTitle} onChange={e=>setEditItemTitle(e.target.value)} /><input className="w-20 border p-1 rounded text-sm" value={editItemPrice} onChange={e=>setEditItemPrice(e.target.value)} /><input className="w-20 border p-1 rounded text-sm" value={editItemDuration} onChange={e=>setEditItemDuration(e.target.value)} /></div> <div className="flex justify-end gap-2"><button onClick={()=>setEditingIndex(null)} className="px-3 py-1 bg-white border rounded text-xs">Cancelar</button><button onClick={()=>handleUpdateItem(index)} className="px-3 py-1 bg-green-600 text-white rounded text-xs">Salvar</button></div> </div> ); return <SortableLinkItem key={uniqueId} id={uniqueId} link={link} index={index} onEdit={()=>{setEditingIndex(index); setEditItemTitle(link.title); setEditItemPrice(link.price||''); setEditItemDuration(String(link.durationMinutes||30)); setEditItemCat(link.category||''); setEditItemImage(link.imageUrl||'');}} onDelete={() => handleDeleteItem(link)} editingIndex={editingIndex} /> })} </div> </SortableContext> </DndContext> <div className={`bg-white p-6 rounded-xl border border-gray-100 ${!isProPlan?'opacity-60 grayscale pointer-events-none':''}`}><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FaTag className="text-purple-500"/> Cupons {!isProPlan && <FaLock className="text-gray-400 size-3"/>}</h3><div className="flex gap-2 mb-4"><input value={newCouponCode} onChange={e=>setNewCouponCode(e.target.value.toUpperCase())} className="border p-2 rounded text-sm w-24 font-bold uppercase" placeholder="CODIGO"/><input value={newCouponValue} onChange={e=>setNewCouponValue(e.target.value)} className="border p-2 rounded text-sm w-20" placeholder="Valor"/><button onClick={handleAddCoupon} className="bg-purple-600 text-white px-4 rounded font-bold text-sm">Criar</button></div><div className="space-y-2">{pageData?.coupons?.map(c => (<div key={c.code} className="flex justify-between p-2 bg-gray-50 rounded text-sm border"><span className="font-bold">{c.code}</span> <span>{c.type==='percent'?`${c.value}%`:`R$${c.value}`}</span></div>))}</div></div>
             </div>
        )}

        {/* PERFIL */}
        {activeTab === 'profile' && (
             <div className="space-y-6">
                 {!isProPlan && ( <div onClick={() => setIsUpgradeModalOpen(true)} className="bg-gray-900 text-white p-4 rounded-xl shadow-lg cursor-pointer border border-orange-500/30 flex justify-between items-center"> <div> <h3 className="font-bold text-orange-400 flex items-center gap-2"><FaCrown/> Plano Gratuito</h3> <p className="text-xs text-gray-400">Toque para desbloquear recursos VIP</p> </div> <button className="bg-orange-600 px-3 py-1 rounded text-xs font-bold">Ver Planos</button> </div> )}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start"> <div className="relative w-24 h-24 shrink-0 mx-auto md:mx-0"> <div className="w-full h-full rounded-full overflow-hidden border-4 border-gray-100 relative bg-gray-200"> {pageData?.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="96px"/> : <FaCamera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400"/>} </div> <label className="absolute bottom-0 right-0 bg-orange-500 text-white p-2 rounded-full cursor-pointer"><FaCamera size={12}/><input type="file" className="hidden" onChange={handleProfileUpload}/></label> </div> <div className="flex-1 w-full space-y-3"> <input value={editingProfileTitle} onChange={e=>setEditingProfileTitle(e.target.value)} className="w-full text-lg font-bold border-b outline-none" placeholder="Nome da Barbearia"/> <textarea value={editingProfileBio} onChange={e=>setEditingProfileBio(e.target.value)} className="w-full text-sm border rounded p-2 outline-none" rows={2} placeholder="Bio"/> <div className="flex items-center border rounded px-3 py-2 bg-gray-50"><FaWhatsapp className="text-green-500 mr-2"/> +55 <input value={editingProfileWhatsapp} onChange={e=>setEditingProfileWhatsapp(e.target.value)} className="bg-transparent outline-none ml-2 w-full" placeholder="Seu Zap"/></div> <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}><FaMapMarkerAlt className="text-gray-400" /><input type="text" value={editingProfileAddress} onChange={e => setEditingProfileAddress(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Endereço Completo" : "Endereço (Recurso Pro)"} disabled={!isProPlan} />{!isProPlan && <FaLock className="text-gray-400" />}</div> <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}><FaKey className="text-blue-500" /><input type="text" value={editingProfilePix} onChange={e => setEditingProfilePix(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Chave Pix (CPF, Email, Telefone)" : "Chave Pix (Recurso Pro)"} disabled={!isProPlan}/>{!isProPlan && <FaLock className="text-gray-400" />}</div> <div className="border-t pt-4 mt-2"> <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><FaClock className="text-orange-500"/> Horário de Funcionamento</h4> <div className="mb-4"><label className="text-xs font-bold text-gray-500 block mb-2">Dias de Funcionamento</label><div className="flex gap-2 flex-wrap">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (<button key={day} onClick={() => toggleDay(index)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${schedDays.includes(index) ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>{day}</button>))}</div></div> <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-gray-500 block mb-1">Abre às</label><input type="time" value={schedOpen} onChange={e => setSchedOpen(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">Fecha às</label><input type="time" value={schedClose} onChange={e => setSchedClose(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">Início Almoço</label><input type="time" value={schedLunchStart} onChange={e => setSchedLunchStart(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">Fim Almoço</label><input type="time" value={schedLunchEnd} onChange={e => setSchedLunchEnd(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div></div> </div> <button onClick={() => setIsOpenStore(!isOpenStore)} className={`w-full py-2 rounded font-bold flex justify-center items-center gap-2 ${isOpenStore?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{isOpenStore?<><FaDoorOpen/> Aberto</>:<><FaDoorClosed/> Fechado</>}</button> <button onClick={handleSaveProfile} className="bg-orange-600 text-white px-4 py-2 rounded font-bold w-full"><FaSave/> Salvar Dados</button> </div> </div> <div className="bg-white p-6 rounded-xl border border-gray-100"> <h3 className="font-bold text-gray-800 mb-4">Aparência</h3> <div className="flex gap-4 mb-4"><label className={`cursor-pointer px-4 py-2 rounded bg-gray-100 text-sm font-bold border hover:bg-gray-200 ${!isProPlan && 'opacity-50 pointer-events-none'}`}>Alterar Capa (Pro) <input type="file" className="hidden" onChange={handleBgUpload} disabled={!isProPlan}/></label></div> <div className="grid grid-cols-4 gap-2">{themes.map(t => (<button key={t.name} onClick={()=>{if(!t.isPro || isProPlan) updatePageTheme(pageSlug!, t.name)}} className={`h-10 rounded ${t.colorClass} ${pageData?.theme===t.name?'ring-2 ring-orange-500':''} relative`}>{t.isPro && !isProPlan && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><FaLock className="text-white"/></div>}</button>))}</div> </div> <div className="bg-white p-6 rounded-xl border border-gray-100 text-center"> <h3 className="font-bold text-gray-800 mb-4">Divulgação</h3> <div className="flex justify-center gap-2"><button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/${pageSlug}`); setCopyButtonText("Copiado!"); setTimeout(()=>setCopyButtonText("Copiar Link"),2000)}} className="bg-orange-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><FaCopy/> {copyButtonText}</button><button onClick={()=>setShowQRCode(!showQRCode)} className="bg-gray-800 text-white px-4 py-2 rounded font-bold"><FaQrcode/></button></div> {showQRCode && isProPlan && <div className="mt-4 flex justify-center"><QRCodeCanvas value={`${window.location.origin}/${pageSlug}`} size={150}/></div>} </div>
             </div>
        )}

        {/* ADMIN PANEL (TABELAS CORRIGIDAS AQUI) */}
        {isAdmin && !adminViewId && (
            <div className="mt-12 bg-gray-950 text-white p-6 rounded-xl border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-orange-500"><FaCrown/> Painel Super Admin</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-800 text-gray-400 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3 rounded-tl-lg">Data</th>
                                <th className="p-3">Nome</th>
                                <th className="p-3">Email</th>
                                <th className="p-3">Plano</th>
                                <th className="p-3 rounded-tr-lg text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {allUsers.map((u) => {
                                let trialEndStr = "";
                                if(u.trialDeadline && u.plan !== 'pro') {
                                    const d = new Date(u.trialDeadline.seconds * 1000);
                                    trialEndStr = d.toLocaleDateString('pt-BR');
                                }
                                return (
                                    <tr key={u.uid} className="hover:bg-gray-800/50 transition">
                                        <td className="p-3 text-gray-500 text-xs">
                                            {u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="p-3 font-bold">{u.displayName || 'Sem Nome'}</td>
                                        <td className="p-3 text-gray-400">{u.email}</td>
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className={`px-2 py-1 rounded text-xs font-bold w-fit ${u.plan === 'pro' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                                    {u.plan ? u.plan.toUpperCase() : 'FREE'}
                                                </span>
                                                {trialEndStr && <span className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><FaCalendarDay size={8}/> Vence: {trialEndStr}</span>}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right flex gap-2 justify-end">
                                            <button onClick={() => handleAdminManage(u.uid)} className="px-3 py-1 rounded text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 flex items-center gap-1 transition" title="Entrar na conta">
                                                <FaStore/> Gerenciar
                                            </button>
                                            <button onClick={() => handleTogglePlan(u)} className={`px-3 py-1 rounded text-xs font-bold border transition flex items-center gap-1 ${u.plan === 'pro' ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-green-500 text-green-400 hover:bg-green-500/10'}`}>
                                                {u.plan === 'pro' ? <><FaToggleOff/> Desativar</> : <><FaToggleOn/> Virar Pro</>}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {allUsers.length === 0 && <p className="text-center text-gray-500 py-4">Nenhum usuário cadastrado.</p>}
            </div>
        )}

      </main>
      <a href="https://wa.me/5579996337995?text=Ola,%20estou%20no%20painel%20e%20preciso%20de%20ajuda%20com%20a%20configuracao" target="_blank" rel="noopener noreferrer" className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 transition-all transform hover:scale-105 font-bold"> <FaWhatsapp size={24} /> <span className="hidden md:inline">Suporte</span> </a>
    </div>
  );
}