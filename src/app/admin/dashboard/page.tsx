'use client';

import React, { useEffect, useState, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOutUser } from '@/lib/authService';
import {
  getPageDataForUser, addLinkToPage, deleteLinkFromPage, updateLinksOnPage,
  updatePageTheme, updatePageBackground, updateProfileImage, updatePageProfileInfo, updatePageCoupons,
  getAllUsers, getUpcomingAppointments, updateAppointmentStatus, updateUserPlan,
  PageData, LinkData, CouponData, AppointmentData
} from '@/lib/pageService';
import { 
  FaUserCog, FaImage, FaSave, FaQrcode, FaTag, FaTrashAlt,
  FaCut, FaPlus, FaCamera, FaCopy, FaExternalLinkAlt, FaLock, FaMapMarkerAlt, FaDoorOpen, FaDoorClosed, FaWhatsapp, FaKey, FaClock, FaUsers, FaSearch, FaCalendarAlt, FaCheck, FaTimes, FaList, FaMoneyBillWave, FaChartLine, FaWallet, FaHourglassHalf, FaCrown, FaToggleOn, FaToggleOff, FaStar, FaBolt, FaStore, FaArrowLeft, FaMagic, FaCalendarDay, FaHeadset
} from 'react-icons/fa';
import Image from 'next/image';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';
import { QRCodeCanvas } from 'qrcode.react';
import FiscalModal from '@/components/FiscalModal';
import { UpgradeModal } from '@/components/UpgradeModal';

// Configurações Cloudinary
const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""; 
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

// Templeid
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
  
  // --- ESTADO DO SUPER ADMIN (Modo "Espião") ---
  const [adminViewId, setAdminViewId] = useState<string | null>(null);

  // Agenda
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  // Modais
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false); 

  // Formulários
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

  // Edição
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

  // Super Admin
  const isAdmin = userData?.role === 'admin';
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [adminSearch, setAdminSearch] = useState('');

  // Helpers
  const isProPlan = (pageData?.plan === 'pro');
  const existingCategories = Array.from(new Set(pageData?.links?.map(l => l.category).filter(Boolean) || []));

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Stats Financeiros
  const financialStats = React.useMemo(() => {
      const upcomingApps = appointments; 
      return {
          count: upcomingApps.length,
          pending: upcomingApps.filter(a => a.status === 'pending').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
          confirmed: upcomingApps.filter(a => a.status === 'confirmed').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
          completed: upcomingApps.filter(a => a.status === 'completed').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
          projected: upcomingApps.filter(a => a.status !== 'cancelled').reduce((acc, curr) => acc + (curr.totalValue || 0), 0),
      };
  }, [appointments]);

  // Estatísticas Admin
  const adminStats = React.useMemo(() => {
      if (!allUsers) return { total: 0, pro: 0, trial: 0 };
      return {
          total: allUsers.length,
          pro: allUsers.filter(u => u.plan === 'pro').length,
          trial: allUsers.filter(u => u.plan !== 'pro').length
      };
  }, [allUsers]);

  const filteredUsers = React.useMemo(() => {
      if (!adminSearch) return allUsers;
      const lower = adminSearch.toLowerCase();
      return allUsers.filter(u => 
          (u.displayName && u.displayName.toLowerCase().includes(lower)) || 
          (u.email && u.email.toLowerCase().includes(lower))
      );
  }, [allUsers, adminSearch]);

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
            } else {
                setSchedDays([1, 2, 3, 4, 5, 6]);
            }

            if (data.plan === 'pro' && data.trialDeadline) {
                const now = new Date();
                const deadline = data.trialDeadline.toDate();
                const diffTime = Math.abs(deadline.getTime() - now.getTime());
                setDaysLeft(now > deadline ? 0 : Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            } else setDaysLeft(null);

          } else {
            if (adminViewId) {
                alert("⚠️ AVISO DO SISTEMA:\n\nEste usuário não possui uma página configurada (Cadastro antigo).\nNão é possível gerenciar.");
                setAdminViewId(null);
                setActiveTab('agenda');
            }
          }
      } catch (error) {
          console.error("Erro ao buscar dados:", error);
      } finally {
          setIsLoadingData(false);
      }
    }
  }, [user, adminViewId]); 

  const fetchAppointments = useCallback(async () => {
      if (!pageSlug) return;
      setIsLoadingAppointments(true);
      try {
        const data = await getUpcomingAppointments(pageSlug);
        setAppointments(data);
      } catch (e) {
        console.error("Erro fetch agenda:", e);
      }
      setIsLoadingAppointments(false);
  }, [pageSlug]);

  useEffect(() => {
      if (user && isAdmin) {
          const fetchAll = async () => {
              const users = await getAllUsers();
              users.sort((a: any, b: any) => {
                  if (b.createdAt && a.createdAt) return b.createdAt.seconds - a.createdAt.seconds;
                  return 0;
              });
              setAllUsers(users);
          };
          fetchAll();
      }
  }, [user, isAdmin]);

  useEffect(() => { if (!loading && user) fetchPageData(); }, [user, loading, fetchPageData]);
  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [user, loading, router]);
  useEffect(() => { if (activeTab === 'agenda' && pageSlug) fetchAppointments(); }, [activeTab, pageSlug, fetchAppointments]);

  // --- HANDLERS ---

  const handleAdminManage = (targetUid: string) => {
      if (confirm("Entrar no painel desta barbearia?")) {
          setAdminViewId(targetUid);
          setActiveTab('profile');
          window.scrollTo({ top: 0, behavior: 'smooth' });
      }
  };

  const handleExitAdminMode = () => {
      setAdminViewId(null);
      setActiveTab('agenda');
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTogglePlan = async (targetUser: any) => {
      if(!confirm(`Alterar plano de ${targetUser.email} para ${targetUser.plan === 'pro' ? 'FREE' : 'PRO'}?`)) return;
      const newPlan = targetUser.plan === 'pro' ? 'free' : 'pro';
      await updateUserPlan(targetUser.uid, newPlan);
      setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? {...u, plan: newPlan} : u));
  };

  const handleStatusChange = async (id: string, newStatus: 'confirmed' | 'cancelled' | 'completed') => {
      if(!confirm("Confirmar alteração de status?")) return;
      await updateAppointmentStatus(id, newStatus);
      fetchAppointments();
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

  const getUniqueId = (link: LinkData, index: number) => {
      const safeTitle = (link.title || 'untitled').replace(/[^a-zA-Z0-9]/g, '');
      return `item-${safeTitle}-${index}`;
  };

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
    if (!isProPlan && current.length >= 8) return alert("Limite Free atingido.");
    const exists = current.some(l => l.title === newItemTitle);
    if(exists) { alert("Já existe serviço com esse nome."); return; }

    const newItem: LinkData = { 
        title: newItemTitle, url: '', type: 'service', order: current.length + 1, clicks: 0, 
        price: newItemPrice, description: newItemDesc, imageUrl: newItemImage, category: newItemCat, 
        durationMinutes: parseInt(newItemDuration) || 30 
    };
    await addLinkToPage(pageSlug, newItem);
    setNewItemTitle(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemImage(''); setNewItemCat(''); setNewItemDuration('30');
    fetchPageData();
  };

  const handleUpdateItem = async (index: number) => {
    if (!pageSlug || !pageData) return;
    const updated = [...pageData.links];
    updated[index] = { ...updated[index], title: editItemTitle, price: editItemPrice, description: editItemDesc, imageUrl: editItemImage, category: editItemCat, durationMinutes: parseInt(editItemDuration)||30 };
    await updateLinksOnPage(pageSlug, updated);
    setEditingIndex(null); fetchPageData();
  };

  const toggleDay = (dayIndex: number) => {
    setSchedDays(prev => prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex].sort());
  };

  const handleSaveProfile = async () => {
      if(!pageSlug) return;
      const whatsappToSave = editingProfileWhatsapp ? `55${editingProfileWhatsapp.replace(/\D/g, '')}` : '';
      const schedule = { open: schedOpen, close: schedClose, lunchStart: schedLunchStart, lunchEnd: schedLunchEnd, workingDays: schedDays };
      await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio, isProPlan ? editingProfileAddress : '', isOpenStore, whatsappToSave, isProPlan ? editingProfilePix : '', schedule);
      alert("Dados salvos com sucesso!");
      fetchPageData();
  };

  const handleItemImageUpload = async (e: any, isNew: boolean) => {
      const url = await uploadToCloudinary(e.target.files[0]);
      if(url) isNew ? setNewItemImage(url) : setEditItemImage(url);
      setIsUploadingItemImg(false);
  };
  const handleProfileUpload = async (e: any) => {
      setIsUploadingProfile(true);
      const url = await uploadToCloudinary(e.target.files[0]);
      if(url && pageSlug) { await updateProfileImage(pageSlug, url); fetchPageData(); }
      setIsUploadingProfile(false);
  };
  const handleBgUpload = async (e: any) => {
      setIsUploadingBg(true);
      const url = await uploadToCloudinary(e.target.files[0]);
      if(url && pageSlug) { await updatePageBackground(pageSlug, url); fetchPageData(); }
      setIsUploadingBg(false);
  };
  const handleAddCoupon = async () => {
      if(!isProPlan || !pageSlug) return alert("Pro apenas.");
      const newC: CouponData = { code: newCouponCode.toUpperCase(), type: newCouponType, value: parseFloat(newCouponValue.replace(',','.')), active: true };
      const list = [...(pageData?.coupons||[]), newC];
      await updatePageCoupons(pageSlug, list);
      setPageData(prev => prev ? {...prev, coupons: list} : null);
  };

  if (loading || isLoadingData) return <div className="flex h-screen items-center justify-center text-orange-600 font-bold">Carregando Painel...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} />
      <FiscalModal isOpen={isFiscalModalOpen} onClose={() => setIsFiscalModalOpen(false)} onSave={() => {}} />

      {/* HEADER */}
      <nav className="bg-white shadow-sm sticky top-0 z-20 px-4 h-16 flex justify-between items-center max-w-4xl mx-auto">
         {/* ÍCONE CORRIGIDO PARA TESOURA (FaCut) */}
         <h1 className="font-bold text-gray-800 flex gap-2 items-center"><FaCut className="text-orange-500"/> BarberPro</h1>
         <div className="flex gap-4">
             {pageSlug && <a href={`/${pageSlug}`} target="_blank" className="text-sm font-bold text-orange-600 hover:underline flex items-center gap-1"><FaExternalLinkAlt/> Ver Loja</a>}
             <button onClick={signOutUser} className="text-red-500 text-sm font-medium">Sair</button>
         </div>
      </nav>

      {/* MODO SUPER ADMIN */}
      {adminViewId && (
          <div className="bg-red-600 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-16 z-30">
              <span className="font-bold flex items-center gap-2 text-sm md:text-base">
                  <FaMagic className="animate-pulse"/> MODO SUPER ADMIN: Editando {pageData?.title || 'Página do Usuário'}
              </span>
              <button onClick={handleExitAdminMode} className="bg-white text-red-600 text-xs font-bold px-4 py-2 rounded-full hover:bg-gray-100 flex items-center gap-2 shadow-lg transition active:scale-95"><FaArrowLeft/> Sair do Modo Edição</button>
          </div>
      )}

      <main className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        
        {/* TABS */}
        <div className="flex bg-gray-200 p-1 rounded-xl">
            <button onClick={() => setActiveTab('agenda')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'agenda' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}><FaCalendarAlt/> Agenda</button>
            <button onClick={() => setActiveTab('services')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'services' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}><FaList/> Serviços</button>
            <button onClick={() => setActiveTab('profile')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'profile' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}><FaUserCog/> Perfil</button>
        </div>

        {/* AGENDA */}
        {activeTab === 'agenda' && (
            <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm"><div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1"><FaChartLine/> Total Futuro</div><div className="text-2xl font-bold text-gray-800">R$ {financialStats.projected.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-yellow-400 shadow-sm"><div className="flex items-center gap-2 text-yellow-600 text-xs font-bold uppercase mb-1"><FaHourglassHalf/> A Receber</div><div className="text-2xl font-bold text-gray-800">R$ {financialStats.pending.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm"><div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase mb-1"><FaWallet/> Confirmado</div><div className="text-2xl font-bold text-gray-800">R$ {financialStats.confirmed.toFixed(2)}</div></div>
                    <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm"><div className="flex items-center gap-2 text-green-600 text-xs font-bold uppercase mb-1"><FaMoneyBillWave/> Realizado</div><div className="text-2xl font-bold text-gray-800">R$ {financialStats.completed.toFixed(2)}</div></div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
                    <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-gray-800 text-lg">Próximos Agendamentos</h3><button onClick={fetchAppointments} className="text-sm text-blue-600 hover:underline">Atualizar</button></div>
                    {isLoadingAppointments ? <div className="text-center py-10">Carregando...</div> : <div className="space-y-4">{appointments.length === 0 ? <p className="text-center text-gray-400 py-10">Agenda vazia.</p> : appointments.map(app => {
                        let start; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                        return (
                            <div key={app.id} className="border p-4 rounded-xl flex flex-col gap-2 bg-gray-50">
                                <div className="flex justify-between font-bold"><span>{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - {app.customerName}</span> <span className="text-xs px-2 py-1 bg-gray-200 rounded">{app.status}</span></div>
                                <div className="text-xs text-gray-500">{start.toLocaleDateString('pt-BR')} • {app.serviceName} • R$ {app.totalValue.toFixed(2)}</div>
                                <div className="flex gap-2 mt-2">
                                    {app.status === 'pending' && <button onClick={() => handleStatusChange(app.id!, 'confirmed')} className="flex-1 bg-green-600 text-white p-2 rounded text-xs font-bold">Confirmar Pagto</button>}
                                    {app.status === 'confirmed' && <button onClick={() => handleStatusChange(app.id!, 'completed')} className="flex-1 bg-blue-600 text-white p-2 rounded text-xs font-bold">Concluir</button>}
                                    {app.status !== 'cancelled' && <button onClick={() => handleStatusChange(app.id!, 'cancelled')} className="bg-white border border-red-300 text-red-500 p-2 rounded text-xs font-bold">Cancelar</button>}
                                </div>
                            </div>
                        )
                    })}</div>}
                </div>
            </div>
        )}

        {/* SERVIÇOS */}
        {activeTab === 'services' && (
             <div className="space-y-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                     <h3 className="font-bold text-gray-800 mb-4 flex gap-2 items-center"><FaPlus className="text-green-500"/> Novo Serviço</h3>
                     <form onSubmit={handleAddItem} className="space-y-4">
                         <div className="flex flex-col sm:flex-row gap-4 items-start">
                             <div className="w-20 h-20 bg-gray-50 rounded border-2 border-dashed flex items-center justify-center relative cursor-pointer">
                                 {newItemImage ? <Image src={newItemImage} alt="Serviço" fill className="object-cover rounded" sizes="80px"/> : <FaCamera className="text-gray-400"/>}
                                 <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleItemImageUpload(e, true)} />
                                 {isUploadingItemImg && <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-xs">...</div>}
                             </div>
                             <div className="flex-1 w-full space-y-3">
                                 <div className="flex gap-3"><input className="flex-1 border p-2 rounded text-sm" placeholder="Nome" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} required /><input className="w-24 border p-2 rounded text-sm" placeholder="$$" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} /></div>
                                 <div className="flex gap-3"><input className="w-full border p-2 rounded text-sm" placeholder="Categoria" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} list="cats" /><datalist id="cats">{existingCategories.map((c: any, i) => <option key={i} value={c}/>)}</datalist><div className="flex items-center border rounded px-2 w-32 bg-gray-50"><FaClock className="text-gray-400 mr-2"/><input type="number" className="w-full bg-transparent p-2 text-sm outline-none" value={newItemDuration} onChange={e => setNewItemDuration(e.target.value)} step="5" /></div></div>
                             </div>
                         </div>
                         <button type="submit" className="w-full bg-green-600 text-white font-bold py-2 rounded">Adicionar</button>
                     </form>
                 </div>
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                     <SortableContext items={pageData?.links?.map((l, i) => getUniqueId(l, i)) || []} strategy={verticalListSortingStrategy}>
                         <div className="space-y-3">
                             {pageData?.links?.map((link, index) => {
                                 const uniqueId = getUniqueId(link, index);
                                 if(editingIndex === index) return (
                                     <div key={uniqueId} className="bg-orange-50 p-4 rounded border border-orange-200 space-y-2">
                                         <p className="text-xs font-bold text-orange-800">Editando: {link.title}</p>
                                         <div className="flex gap-2"><input className="flex-1 border p-1 rounded text-sm" value={editItemTitle} onChange={e=>setEditItemTitle(e.target.value)} /><input className="w-20 border p-1 rounded text-sm" value={editItemPrice} onChange={e=>setEditItemPrice(e.target.value)} /><input className="w-20 border p-1 rounded text-sm" value={editItemDuration} onChange={e=>setEditItemDuration(e.target.value)} /></div>
                                         <div className="flex justify-end gap-2"><button onClick={()=>setEditingIndex(null)} className="px-3 py-1 bg-white border rounded text-xs">Cancelar</button><button onClick={()=>handleUpdateItem(index)} className="px-3 py-1 bg-green-600 text-white rounded text-xs">Salvar</button></div>
                                     </div>
                                 );
                                 return <SortableLinkItem key={uniqueId} id={uniqueId} link={link} index={index} onEdit={()=>{setEditingIndex(index); setEditItemTitle(link.title); setEditItemPrice(link.price||''); setEditItemDuration(String(link.durationMinutes||30)); setEditItemCat(link.category||''); setEditItemImage(link.imageUrl||'');}} onDelete={async()=>{if(confirm("Excluir?")){await deleteLinkFromPage(pageSlug!, link); fetchPageData();}}} editingIndex={editingIndex} />
                             })}
                         </div>
                     </SortableContext>
                 </DndContext>
                 <div className={`bg-white p-6 rounded-xl border border-gray-100 ${!isProPlan?'opacity-60 grayscale pointer-events-none':''}`}><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FaTag className="text-purple-500"/> Cupons {!isProPlan && <FaLock className="text-gray-400 size-3"/>}</h3><div className="flex gap-2 mb-4"><input value={newCouponCode} onChange={e=>setNewCouponCode(e.target.value.toUpperCase())} className="border p-2 rounded text-sm w-24 font-bold uppercase" placeholder="CODIGO"/><input value={newCouponValue} onChange={e=>setNewCouponValue(e.target.value)} className="border p-2 rounded text-sm w-20" placeholder="Valor"/><button onClick={handleAddCoupon} className="bg-purple-600 text-white px-4 rounded font-bold text-sm">Criar</button></div><div className="space-y-2">{pageData?.coupons?.map(c => (<div key={c.code} className="flex justify-between p-2 bg-gray-50 rounded text-sm border"><span className="font-bold">{c.code}</span> <span>{c.type==='percent'?`${c.value}%`:`R$${c.value}`}</span></div>))}</div></div>
             </div>
        )}

        {/* PERFIL */}
        {activeTab === 'profile' && (
             <div className="space-y-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start">
                     <div className="relative w-24 h-24 shrink-0 mx-auto md:mx-0">
                         <div className="w-full h-full rounded-full overflow-hidden border-4 border-gray-100 relative bg-gray-200">
                              {pageData?.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="96px"/> : <FaCamera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400"/>}
                         </div>
                         <label className="absolute bottom-0 right-0 bg-orange-500 text-white p-2 rounded-full cursor-pointer"><FaCamera size={12}/><input type="file" className="hidden" onChange={handleProfileUpload}/></label>
                     </div>
                     <div className="flex-1 w-full space-y-3">
                         <input value={editingProfileTitle} onChange={e=>setEditingProfileTitle(e.target.value)} className="w-full text-lg font-bold border-b outline-none" placeholder="Nome da Barbearia"/>
                         <textarea value={editingProfileBio} onChange={e=>setEditingProfileBio(e.target.value)} className="w-full text-sm border rounded p-2 outline-none" rows={2} placeholder="Bio"/>
                         <div className="flex items-center border rounded px-3 py-2 bg-gray-50"><FaWhatsapp className="text-green-500 mr-2"/> +55 <input value={editingProfileWhatsapp} onChange={e=>setEditingProfileWhatsapp(e.target.value)} className="bg-transparent outline-none ml-2 w-full" placeholder="Seu Zap"/></div>
                         <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}><FaMapMarkerAlt className="text-gray-400" /><input type="text" value={editingProfileAddress} onChange={e => setEditingProfileAddress(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Endereço Completo" : "Endereço (Recurso Pro)"} disabled={!isProPlan} />{!isProPlan && <FaLock className="text-gray-400" />}</div>
                         <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}><FaKey className="text-blue-500" /><input type="text" value={editingProfilePix} onChange={e => setEditingProfilePix(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Chave Pix (CPF, Email, Telefone)" : "Chave Pix (Recurso Pro)"} disabled={!isProPlan}/>{!isProPlan && <FaLock className="text-gray-400" />}</div>
                         <div className="border-t pt-4 mt-2">
                             <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><FaClock className="text-orange-500"/> Horário de Funcionamento</h4>
                             <div className="mb-4"><label className="text-xs font-bold text-gray-500 block mb-2">Dias de Funcionamento</label><div className="flex gap-2 flex-wrap">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (<button key={day} onClick={() => toggleDay(index)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${schedDays.includes(index) ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>{day}</button>))}</div></div>
                             <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-gray-500 block mb-1">Abre às</label><input type="time" value={schedOpen} onChange={e => setSchedOpen(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">Fecha às</label><input type="time" value={schedClose} onChange={e => setSchedClose(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">Início Almoço</label><input type="time" value={schedLunchStart} onChange={e => setSchedLunchStart(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">Fim Almoço</label><input type="time" value={schedLunchEnd} onChange={e => setSchedLunchEnd(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/></div></div>
                         </div>
                         <button onClick={() => setIsOpenStore(!isOpenStore)} className={`w-full py-2 rounded font-bold flex justify-center items-center gap-2 ${isOpenStore?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{isOpenStore?<><FaDoorOpen/> Aberto</>:<><FaDoorClosed/> Fechado</>}</button>
                         <button onClick={handleSaveProfile} className="bg-orange-600 text-white px-4 py-2 rounded font-bold w-full"><FaSave/> Salvar Dados</button>
                     </div>
                 </div>
                 <div className="bg-white p-6 rounded-xl border border-gray-100">
                     <h3 className="font-bold text-gray-800 mb-4">Aparência</h3>
                     <div className="flex gap-4 mb-4"><label className={`cursor-pointer px-4 py-2 rounded bg-gray-100 text-sm font-bold border hover:bg-gray-200 ${!isProPlan && 'opacity-50 pointer-events-none'}`}>Alterar Capa (Pro) <input type="file" className="hidden" onChange={handleBgUpload} disabled={!isProPlan}/></label></div>
                     <div className="grid grid-cols-4 gap-2">{themes.map(t => (<button key={t.name} onClick={()=>{if(!t.isPro || isProPlan) updatePageTheme(pageSlug!, t.name)}} className={`h-10 rounded ${t.colorClass} ${pageData?.theme===t.name?'ring-2 ring-orange-500':''} relative`}>{t.isPro && !isProPlan && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><FaLock className="text-white"/></div>}</button>))}</div>
                 </div>
                  <div className="bg-white p-6 rounded-xl border border-gray-100 text-center">
                     <h3 className="font-bold text-gray-800 mb-4">Divulgação</h3>
                     <div className="flex justify-center gap-2"><button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/${pageSlug}`); setCopyButtonText("Copiado!"); setTimeout(()=>setCopyButtonText("Copiar Link"),2000)}} className="bg-orange-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><FaCopy/> {copyButtonText}</button><button onClick={()=>setShowQRCode(!showQRCode)} className="bg-gray-800 text-white px-4 py-2 rounded font-bold"><FaQrcode/></button></div>
                     {showQRCode && isProPlan && <div className="mt-4 flex justify-center"><QRCodeCanvas value={`${window.location.origin}/${pageSlug}`} size={150}/></div>}
                  </div>
             </div>
        )}

        {/* --- SUPER ADMIN PANEL --- */}
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
                                                {/* DATA VENCIMENTO */}
                                                {trialEndStr && <span className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><FaCalendarDay size={8}/> Vence: {trialEndStr}</span>}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right flex gap-2 justify-end">
                                            <button 
                                                onClick={() => handleAdminManage(u.uid)}
                                                className="px-3 py-1 rounded text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 flex items-center gap-1 transition"
                                                title="Entrar na conta"
                                            >
                                                <FaStore/> Gerenciar
                                            </button>

                                            <button 
                                                onClick={() => handleTogglePlan(u)} 
                                                className={`px-3 py-1 rounded text-xs font-bold border transition flex items-center gap-1 ${u.plan === 'pro' ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-green-500 text-green-400 hover:bg-green-500/10'}`}
                                            >
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

      {/* BOTÃO DE SUPORTE FLUTUANTE */}
      <a
        href="https://wa.me/5579996337995?text=Ola,%20estou%20no%20painel%20e%20preciso%20de%20ajuda%20com%20a%20configuracao"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 transition-all transform hover:scale-105 font-bold"
      >
        <FaWhatsapp size={24} />
        <span className="hidden md:inline">Suporte</span>
      </a>

    </div>
  );
}