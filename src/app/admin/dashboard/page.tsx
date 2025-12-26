// src/app/admin/dashboard/page.tsx
'use client';

import React, { useEffect, useState, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOutUser } from '@/lib/authService';
import {
  getPageDataForUser, addLinkToPage, deleteLinkFromPage, updateLinksOnPage,
  updatePageTheme, updatePageBackground, updateProfileImage, updatePageProfileInfo, updatePageCoupons, updateUserFiscalData,
  getAllUsers, getUpcomingAppointments, updateAppointmentStatus, updateUserPlan, findUserByEmail,
  PageData, LinkData, UserData, CouponData, AppointmentData
} from '@/lib/pageService';
import { 
  FaUserCog, FaImage, FaSave, FaQrcode, FaTag, FaTrashAlt,
  FaUtensils, FaPlus, FaCamera, FaCopy, FaExternalLinkAlt, FaLock, FaMapMarkerAlt, FaDoorOpen, FaDoorClosed, FaWhatsapp, FaKey, FaClock, FaUsers, FaSearch, FaCalendarAlt, FaCheck, FaTimes, FaList, FaMoneyBillWave, FaChartLine, FaWallet, FaHourglassHalf, FaCrown, FaToggleOn, FaToggleOff
} from 'react-icons/fa';
import Image from 'next/image';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';
import { QRCodeCanvas } from 'qrcode.react';
import FiscalModal from '@/components/FiscalModal';
import { UpgradeModal } from '@/components/UpgradeModal';

// Configs
const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""; 
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

const themes = [
  { name: 'dark', label: 'Barber Dark', colorClass: 'bg-gray-900', isPro: false },
  { name: 'light', label: 'Clean', colorClass: 'bg-gray-100', isPro: false },
  { name: 'ocean', label: 'Blue', colorClass: 'bg-blue-900', isPro: true },
  { name: 'burger', label: 'Gold', colorClass: 'bg-yellow-600', isPro: true },
];

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  // Tabs: 'agenda' | 'services' | 'profile'
  const [activeTab, setActiveTab] = useState('agenda');

  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  
  // Agenda State
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  // Modais
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false); 

  // Forms Services
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCat, setNewItemCat] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [newItemDuration, setNewItemDuration] = useState('30');
  const [isUploadingItemImg, setIsUploadingItemImg] = useState(false);

  // Forms Coupons
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed'>('percent');

  // Edit State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemCat, setEditItemCat] = useState('');
  const [editItemImage, setEditItemImage] = useState('');
  const [editItemDuration, setEditItemDuration] = useState('30');

  // Profile State
  const [editingProfileTitle, setEditingProfileTitle] = useState('');
  const [editingProfileBio, setEditingProfileBio] = useState('');
  const [editingProfileAddress, setEditingProfileAddress] = useState('');
  const [editingProfileWhatsapp, setEditingProfileWhatsapp] = useState('');
  const [editingProfilePix, setEditingProfilePix] = useState('');
  const [isOpenStore, setIsOpenStore] = useState(true);
  
  // --- NOVOS CAMPOS DE HORÁRIO ---
  const [schedOpen, setSchedOpen] = useState('09:00');
  const [schedClose, setSchedClose] = useState('19:00');
  const [schedLunchStart, setSchedLunchStart] = useState('');
  const [schedLunchEnd, setSchedLunchEnd] = useState('');

  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copiar Link');

  // ADMIN STATE
  const isAdmin = userData?.role === 'admin';
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const isProPlan = (pageData?.plan === 'pro');
  const existingCategories = Array.from(new Set(pageData?.links?.map(l => l.category).filter(Boolean) || []));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- FINANCIAL STATS ---
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

  // --- DATA FETCHING ---

  const fetchPageData = useCallback(async () => {
    const idToFetch = user?.uid; // Dono vê o seu
    if (idToFetch) {
      setIsLoadingData(true);
      const result = await getPageDataForUser(idToFetch);
      if (result) {
        const data = result.data as PageData;
        if (data.links) data.links.sort((a, b) => (a.order || 0) - (b.order || 0));
        setPageData(data);
        setPageSlug(result.slug);
        
        // Populate Inputs
        setEditingProfileTitle(data.title || '');
        setEditingProfileBio(data.bio || '');
        setEditingProfileAddress(data.address || '');
        let loadedWhats = (data as any).whatsapp || '';
        if (loadedWhats.startsWith('55') && loadedWhats.length > 10) loadedWhats = loadedWhats.substring(2);
        setEditingProfileWhatsapp(loadedWhats);
        setEditingProfilePix((data as any).pixKey || '');
        setIsOpenStore(data.isOpen !== false);

        // Populate Schedule
        if (data.schedule) {
            setSchedOpen(data.schedule.open || '09:00');
            setSchedClose(data.schedule.close || '19:00');
            setSchedLunchStart(data.schedule.lunchStart || '');
            setSchedLunchEnd(data.schedule.lunchEnd || '');
        }

        if (data.plan === 'pro' && data.trialDeadline) {
            const now = new Date();
            const deadline = data.trialDeadline.toDate();
            const diffTime = Math.abs(deadline.getTime() - now.getTime());
            setDaysLeft(now > deadline ? 0 : Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        } else setDaysLeft(null);
      }
      setIsLoadingData(false);
    }
  }, [user]);

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

  // Busca lista de todos usuarios se for admin
  useEffect(() => {
      if (user && isAdmin) {
          const fetchAll = async () => {
              const users = await getAllUsers();
              // Ordena por data
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

  // Admin: Toggle Plan na Lista
  const handleTogglePlan = async (targetUser: any) => {
      if(!confirm(`Alterar plano de ${targetUser.email} para ${targetUser.plan === 'pro' ? 'FREE' : 'PRO'}?`)) return;
      
      const newPlan = targetUser.plan === 'pro' ? 'free' : 'pro';
      await updateUserPlan(targetUser.uid, newPlan);
      
      // Atualiza lista localmente
      setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? {...u, plan: newPlan} : u));
  };

  const handleStatusChange = async (id: string, newStatus: 'confirmed' | 'cancelled' | 'completed') => {
      let message = "Tem certeza?";
      if (newStatus === 'confirmed') message = "Confirmar recebimento do pagamento?";
      if (newStatus === 'completed') message = "Finalizar atendimento?";
      if(!confirm(message)) return;
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && pageData?.links) {
      setPageData((prev) => {
        if (!prev) return null;
        const oldIndex = prev.links.findIndex((l, i) => (l.url || l.title) + i === active.id);
        const newIndex = prev.links.findIndex((l, i) => (l.url || l.title) + i === over.id);
        const newLinks = arrayMove(prev.links, oldIndex, newIndex);
        const reordered = newLinks.map((l, i) => ({ ...l, order: i + 1 }));
        if (pageSlug) updateLinksOnPage(pageSlug, reordered);
        return { ...prev, links: reordered };
      });
    }
  };

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!pageSlug || !newItemTitle) return;
    const current = pageData?.links || [];
    if (!isProPlan && current.length >= 8) return alert("Limite Free (8 serviços). Vire Pro!");
    const newItem: LinkData = { title: newItemTitle, url: '', type: 'service', order: current.length + 1, clicks: 0, price: newItemPrice, description: newItemDesc, imageUrl: newItemImage, category: newItemCat, durationMinutes: parseInt(newItemDuration) || 30 };
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

  const handleSaveProfile = async () => {
      if(!pageSlug) return;
      const whatsappToSave = editingProfileWhatsapp ? `55${editingProfileWhatsapp.replace(/\D/g, '')}` : '';
      
      const schedule = {
          open: schedOpen,
          close: schedClose,
          lunchStart: schedLunchStart,
          lunchEnd: schedLunchEnd
      };

      await updatePageProfileInfo(
          pageSlug, 
          editingProfileTitle, 
          editingProfileBio, 
          isProPlan ? editingProfileAddress : '', 
          isOpenStore, 
          whatsappToSave, 
          isProPlan ? editingProfilePix : '',
          schedule // SALVA OS HORÁRIOS
      );
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
         <h1 className="font-bold text-gray-800 flex gap-2 items-center"><FaUtensils className="text-orange-500"/> BarberPro</h1>
         <div className="flex gap-4">
             {pageSlug && <a href={`/${pageSlug}`} target="_blank" className="text-sm font-bold text-orange-600 hover:underline flex items-center gap-1"><FaExternalLinkAlt/> Ver Loja</a>}
             <button onClick={signOutUser} className="text-red-500 text-sm font-medium">Sair</button>
         </div>
      </nav>

      <main className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        
        {/* TABS DE NAVEGAÇÃO */}
        <div className="flex bg-gray-200 p-1 rounded-xl">
            <button onClick={() => setActiveTab('agenda')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'agenda' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <FaCalendarAlt/> Agenda
            </button>
            <button onClick={() => setActiveTab('services')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'services' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <FaList/> Serviços
            </button>
            <button onClick={() => setActiveTab('profile')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'profile' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <FaUserCog/> Perfil
            </button>
        </div>

        {/* === ABA: AGENDA === */}
        {activeTab === 'agenda' && (
            <div className="space-y-6">
                
                {/* CARDS FINANCEIROS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                         <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1"><FaChartLine/> Total Futuro</div>
                         <div className="text-2xl font-bold text-gray-800">R$ {financialStats.projected.toFixed(2)}</div>
                         <div className="text-xs text-gray-400">{financialStats.count} agendamentos</div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border-l-4 border-yellow-400 shadow-sm">
                         <div className="flex items-center gap-2 text-yellow-600 text-xs font-bold uppercase mb-1"><FaHourglassHalf/> A Receber</div>
                         <div className="text-2xl font-bold text-gray-800">R$ {financialStats.pending.toFixed(2)}</div>
                         <div className="text-xs text-gray-400">Total Pendente</div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
                         <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase mb-1"><FaWallet/> Confirmado</div>
                         <div className="text-2xl font-bold text-gray-800">R$ {financialStats.confirmed.toFixed(2)}</div>
                         <div className="text-xs text-gray-400">Na Agenda</div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm">
                         <div className="flex items-center gap-2 text-green-600 text-xs font-bold uppercase mb-1"><FaMoneyBillWave/> Realizado</div>
                         <div className="text-2xl font-bold text-gray-800">R$ {financialStats.completed.toFixed(2)}</div>
                         <div className="text-xs text-gray-400">Finalizados</div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-800 text-lg">Próximos Agendamentos</h3>
                        <button onClick={fetchAppointments} className="text-sm text-blue-600 hover:underline">Atualizar</button>
                    </div>
                    
                    {isLoadingAppointments ? <div className="text-center py-10">Carregando agenda...</div> : (
                        <div className="space-y-4">
                            {appointments.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <FaCalendarAlt size={40} className="mx-auto mb-2 opacity-20"/>
                                    <p>Nenhum agendamento futuro encontrado.</p>
                                </div>
                            ) : (
                                appointments.map(app => {
                                    let start: Date;
                                    try {
                                        start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any);
                                        if(isNaN(start.getTime())) throw new Error("Data Inválida");
                                    } catch (e) { start = new Date(); } 

                                    const isToday = new Date().toDateString() === start.toDateString();
                                    const statusColors = { pending: 'bg-yellow-50 text-yellow-800 border-yellow-200', confirmed: 'bg-blue-50 text-blue-800 border-blue-200', cancelled: 'bg-red-50 text-red-800 border-red-200 opacity-70', completed: 'bg-green-50 text-green-800 border-green-200' };
                                    const statusLabels = { pending: 'Aguardando Pagamento', confirmed: 'Confirmado', cancelled: 'Cancelado', completed: 'Concluído' };
                                    
                                    const val = typeof app.totalValue === 'number' ? app.totalValue : 0;
                                    const status = app.status || 'pending';

                                    return (
                                        <div key={app.id || Math.random()} className={`border p-4 rounded-xl flex flex-col gap-4 ${statusColors[status] || 'bg-gray-100'} ${isToday && status !== 'cancelled' ? 'ring-2 ring-orange-500 ring-offset-2' : ''}`}>
                                            <div className="flex justify-between items-start">
                                                <div className="w-full">
                                                    <div className="flex justify-between w-full mb-1">
                                                        <div className="flex gap-2 items-center">
                                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white/50 border border-black/5`}>{statusLabels[status] || status}</span>
                                                            {isToday && <span className="text-[10px] bg-orange-500 text-white font-bold px-2 py-0.5 rounded shadow">HOJE</span>}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-3 mt-2">
                                                        {app.customerPhoto && <img src={app.customerPhoto} alt="user" className="w-10 h-10 rounded-full border-2 border-white shadow-sm"/>}
                                                        <div>
                                                            <h4 className="font-bold text-gray-900 text-lg leading-tight">{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - {app.customerName || 'Cliente'}</h4>
                                                            <p className="text-sm font-medium opacity-80">{app.serviceName || 'Serviço'}</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 text-xs opacity-70 flex gap-2 items-center">
                                                        <span>{start.toLocaleDateString('pt-BR')}</span> • 
                                                        <span>{app.customerPhone}</span> • 
                                                        <span className="font-bold text-sm">R$ {val.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-2 border-t border-black/5 pt-3 mt-1">
                                                {status === 'pending' && (
                                                    <button onClick={() => handleStatusChange(app.id!, 'confirmed')} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"><FaMoneyBillWave/> Confirmar Pagamento</button>
                                                )}
                                                {status === 'confirmed' && (
                                                    <button onClick={() => handleStatusChange(app.id!, 'completed')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"><FaCheck/> Concluir Serviço</button>
                                                )}
                                                {status !== 'cancelled' && status !== 'completed' && (
                                                    <button onClick={() => handleStatusChange(app.id!, 'cancelled')} className="bg-white border border-red-200 text-red-500 hover:bg-red-50 px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition"><FaTimes/></button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* === ABA: SERVIÇOS === */}
        {activeTab === 'services' && (
             <div className="space-y-6">
                 {/* Form Add */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                     <h3 className="font-bold text-gray-800 mb-4 flex gap-2 items-center"><FaPlus className="text-green-500"/> Novo Serviço</h3>
                     <form onSubmit={handleAddItem} className="space-y-4">
                         <div className="flex flex-col sm:flex-row gap-4 items-start">
                             <div className="w-20 h-20 bg-gray-50 rounded border-2 border-dashed flex items-center justify-center relative cursor-pointer">
                                 {newItemImage ? <Image src={newItemImage} alt="Serviço" fill className="object-cover rounded"/> : <FaCamera className="text-gray-400"/>}
                                 <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleItemImageUpload(e, true)} />
                                 {isUploadingItemImg && <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-xs">...</div>}
                             </div>
                             <div className="flex-1 w-full space-y-3">
                                 <div className="flex gap-3">
                                     <input className="flex-1 border p-2 rounded text-sm" placeholder="Nome (Ex: Corte)" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} required />
                                     <input className="w-24 border p-2 rounded text-sm" placeholder="Preço" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
                                 </div>
                                 <div className="flex gap-3">
                                     <input className="w-full border p-2 rounded text-sm" placeholder="Categoria" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} list="cats" />
                                     <datalist id="cats">{existingCategories.map((c: any, i) => <option key={i} value={c}/>)}</datalist>
                                     <div className="flex items-center border rounded px-2 w-32 bg-gray-50"><FaClock className="text-gray-400 mr-2"/><input type="number" className="w-full bg-transparent p-2 text-sm outline-none" value={newItemDuration} onChange={e => setNewItemDuration(e.target.value)} step="5" /></div>
                                 </div>
                             </div>
                         </div>
                         <button type="submit" className="w-full bg-green-600 text-white font-bold py-2 rounded">Adicionar</button>
                     </form>
                 </div>
                 
                 {/* Lista */}
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                     <SortableContext items={pageData?.links?.map((l,i)=>(l.url||l.title)+i)||[]} strategy={verticalListSortingStrategy}>
                         <div className="space-y-3">
                             {pageData?.links?.map((link, index) => {
                                 if(editingIndex === index) return (
                                     <div key={index} className="bg-orange-50 p-4 rounded border border-orange-200 space-y-2">
                                         <p className="text-xs font-bold text-orange-800">Editando: {link.title}</p>
                                         <div className="flex gap-2">
                                             <input className="flex-1 border p-1 rounded text-sm" value={editItemTitle} onChange={e=>setEditItemTitle(e.target.value)} placeholder="Nome"/>
                                             <input className="w-20 border p-1 rounded text-sm" value={editItemPrice} onChange={e=>setEditItemPrice(e.target.value)} placeholder="$$"/>
                                             <input className="w-20 border p-1 rounded text-sm" type="number" value={editItemDuration} onChange={e=>setEditItemDuration(e.target.value)} placeholder="Min"/>
                                         </div>
                                         <div className="flex justify-end gap-2">
                                             <button onClick={()=>setEditingIndex(null)} className="px-3 py-1 bg-white border rounded text-xs">Cancelar</button>
                                             <button onClick={()=>handleUpdateItem(index)} className="px-3 py-1 bg-green-600 text-white rounded text-xs">Salvar</button>
                                         </div>
                                     </div>
                                 );
                                 return <SortableLinkItem key={(link.url||link.title)+index} link={link} index={index} onEdit={()=>{setEditingIndex(index); setEditItemTitle(link.title); setEditItemPrice(link.price||''); setEditItemDuration(String(link.durationMinutes||30)); setEditItemCat(link.category||''); setEditItemImage(link.imageUrl||'');}} onDelete={async()=>{if(confirm("Excluir?")){await deleteLinkFromPage(pageSlug!, link); fetchPageData();}}} editingIndex={editingIndex} />
                             })}
                         </div>
                     </SortableContext>
                 </DndContext>
 
                 {/* Coupons Section */}
                 <div className={`bg-white p-6 rounded-xl border border-gray-100 ${!isProPlan?'opacity-60 grayscale pointer-events-none':''}`}>
                     <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FaTag className="text-purple-500"/> Cupons {!isProPlan && <FaLock className="text-gray-400 size-3"/>}</h3>
                     <div className="flex gap-2 mb-4">
                         <input value={newCouponCode} onChange={e=>setNewCouponCode(e.target.value.toUpperCase())} className="border p-2 rounded text-sm w-24 font-bold uppercase" placeholder="CODIGO"/>
                         <input value={newCouponValue} onChange={e=>setNewCouponValue(e.target.value)} className="border p-2 rounded text-sm w-20" placeholder="Valor"/>
                         <button onClick={handleAddCoupon} className="bg-purple-600 text-white px-4 rounded font-bold text-sm">Criar</button>
                     </div>
                     <div className="space-y-2">
                         {pageData?.coupons?.map(c => (
                             <div key={c.code} className="flex justify-between p-2 bg-gray-50 rounded text-sm border"><span className="font-bold">{c.code}</span> <span>{c.type==='percent'?`${c.value}%`:`R$${c.value}`}</span></div>
                         ))}
                     </div>
                 </div>
             </div>
        )}

        {/* === ABA: PERFIL (ATUALIZADA COM HORÁRIOS) === */}
        {activeTab === 'profile' && (
             <div className="space-y-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start">
                     <div className="relative w-24 h-24 shrink-0 mx-auto md:mx-0">
                         <div className="w-full h-full rounded-full overflow-hidden border-4 border-gray-100 relative bg-gray-200">
                              {pageData?.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover"/> : <FaCamera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400"/>}
                         </div>
                         <label className="absolute bottom-0 right-0 bg-orange-500 text-white p-2 rounded-full cursor-pointer"><FaCamera size={12}/><input type="file" className="hidden" onChange={handleProfileUpload}/></label>
                     </div>
                     <div className="flex-1 w-full space-y-3">
                         <input value={editingProfileTitle} onChange={e=>setEditingProfileTitle(e.target.value)} className="w-full text-lg font-bold border-b outline-none" placeholder="Nome da Barbearia"/>
                         <textarea value={editingProfileBio} onChange={e=>setEditingProfileBio(e.target.value)} className="w-full text-sm border rounded p-2 outline-none" rows={2} placeholder="Bio"/>
                         
                         <div className="flex items-center border rounded px-3 py-2 bg-gray-50">
                             <FaWhatsapp className="text-green-500 mr-2"/> +55 
                             <input value={editingProfileWhatsapp} onChange={e=>setEditingProfileWhatsapp(e.target.value)} className="bg-transparent outline-none ml-2 w-full" placeholder="Seu Zap"/>
                         </div>
 
                         <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}>
                             <FaMapMarkerAlt className="text-gray-400" />
                             <input type="text" value={editingProfileAddress} onChange={e => setEditingProfileAddress(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Endereço Completo" : "Endereço (Recurso Pro)"} disabled={!isProPlan} />
                             {!isProPlan && <FaLock className="text-gray-400" />}
                         </div>
 
                         <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}>
                             <FaKey className="text-blue-500" />
                             <input type="text" value={editingProfilePix} onChange={e => setEditingProfilePix(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Chave Pix (CPF, Email, Telefone)" : "Chave Pix (Recurso Pro)"} disabled={!isProPlan}/>
                             {!isProPlan && <FaLock className="text-gray-400" />}
                         </div>

                         {/* CONFIGURAÇÃO DE HORÁRIOS (NOVO) */}
                         <div className="border-t pt-4 mt-2">
                             <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><FaClock className="text-orange-500"/> Horário de Funcionamento</h4>
                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                     <label className="text-xs font-bold text-gray-500 block mb-1">Abre às</label>
                                     <input type="time" value={schedOpen} onChange={e => setSchedOpen(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/>
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-gray-500 block mb-1">Fecha às</label>
                                     <input type="time" value={schedClose} onChange={e => setSchedClose(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/>
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-gray-500 block mb-1">Início Almoço</label>
                                     <input type="time" value={schedLunchStart} onChange={e => setSchedLunchStart(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/>
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-gray-500 block mb-1">Fim Almoço</label>
                                     <input type="time" value={schedLunchEnd} onChange={e => setSchedLunchEnd(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50"/>
                                 </div>
                             </div>
                         </div>
 
                         <button onClick={() => setIsOpenStore(!isOpenStore)} className={`w-full py-2 rounded font-bold flex justify-center items-center gap-2 ${isOpenStore?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{isOpenStore?<><FaDoorOpen/> Aberto</>:<><FaDoorClosed/> Fechado</>}</button>
                         <button onClick={handleSaveProfile} className="bg-orange-600 text-white px-4 py-2 rounded font-bold w-full"><FaSave/> Salvar Dados</button>
                     </div>
                 </div>
                 
                 <div className="bg-white p-6 rounded-xl border border-gray-100">
                     <h3 className="font-bold text-gray-800 mb-4">Aparência</h3>
                     <div className="flex gap-4 mb-4">
                         <label className={`cursor-pointer px-4 py-2 rounded bg-gray-100 text-sm font-bold border hover:bg-gray-200 ${!isProPlan && 'opacity-50 pointer-events-none'}`}>
                             Alterar Capa (Pro) <input type="file" className="hidden" onChange={handleBgUpload} disabled={!isProPlan}/>
                         </label>
                     </div>
                     <div className="grid grid-cols-4 gap-2">
                         {themes.map(t => (
                             <button key={t.name} onClick={()=>{if(!t.isPro || isProPlan) updatePageTheme(pageSlug!, t.name)}} className={`h-10 rounded ${t.colorClass} ${pageData?.theme===t.name?'ring-2 ring-orange-500':''} relative`}>
                                 {t.isPro && !isProPlan && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><FaLock className="text-white"/></div>}
                             </button>
                         ))}
                     </div>
                 </div>
                 
                  <div className="bg-white p-6 rounded-xl border border-gray-100 text-center">
                     <h3 className="font-bold text-gray-800 mb-4">Divulgação</h3>
                     <div className="flex justify-center gap-2">
                         <button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/${pageSlug}`); setCopyButtonText("Copiado!"); setTimeout(()=>setCopyButtonText("Copiar Link"),2000)}} className="bg-orange-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><FaCopy/> {copyButtonText}</button>
                         <button onClick={()=>setShowQRCode(!showQRCode)} className="bg-gray-800 text-white px-4 py-2 rounded font-bold"><FaQrcode/></button>
                     </div>
                     {showQRCode && isProPlan && <div className="mt-4 flex justify-center"><QRCodeCanvas value={`${window.location.origin}/${pageSlug}`} size={150}/></div>}
                  </div>
             </div>
        )}

        {/* --- SUPER ADMIN PANEL --- */}
        {isAdmin && (
            <div className="mt-12 bg-gray-900 text-white p-6 rounded-xl border border-gray-800">
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
                            {allUsers.map((u) => (
                                <tr key={u.uid} className="hover:bg-gray-800/50 transition">
                                    <td className="p-3 text-gray-500 text-xs">
                                        {u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="p-3 font-bold">{u.displayName || 'Sem Nome'}</td>
                                    <td className="p-3 text-gray-400">{u.email}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${u.plan === 'pro' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                            {u.plan ? u.plan.toUpperCase() : 'FREE'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button 
                                            onClick={() => handleTogglePlan(u)} 
                                            className={`px-3 py-1 rounded text-xs font-bold border transition flex items-center gap-1 ml-auto ${u.plan === 'pro' ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-green-500 text-green-400 hover:bg-green-500/10'}`}
                                        >
                                            {u.plan === 'pro' ? <><FaToggleOff/> Desativar</> : <><FaToggleOn/> Virar Pro</>}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {allUsers.length === 0 && <p className="text-center text-gray-500 py-4">Nenhum usuário cadastrado.</p>}
            </div>
        )}

      </main>
    </div>
  );
}