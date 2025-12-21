// src/app/admin/dashboard/page.tsx
'use client';

import React, { useEffect, useState, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOutUser } from '@/lib/authService';
import {
  getPageDataForUser, addLinkToPage, deleteLinkFromPage, updateLinksOnPage,
  updatePageTheme, updatePageBackground, updateProfileImage, updatePageProfileInfo, updatePageCoupons, updateUserFiscalData,
  getAllUsers, 
  PageData, LinkData, UserData, CouponData, findUserByEmail, updateUserPlan
} from '@/lib/pageService';
import { 
  FaUserCog, FaImage, FaSave, FaQrcode, FaTag, FaTrashAlt,
  FaUtensils, FaPlus, FaTrash, FaCamera, FaCopy, FaExternalLinkAlt, FaLock, FaMapMarkerAlt, FaStore, FaDoorOpen, FaDoorClosed, FaWhatsapp, FaKey, FaClock, FaUsers, FaSearch
} from 'react-icons/fa';
import Image from 'next/image';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';
import { QRCodeCanvas } from 'qrcode.react';
import FiscalModal from '@/components/FiscalModal';
import { UpgradeModal } from '@/components/UpgradeModal'; // <--- IMPORTANTE

// Pega chaves do .env ou usa string vazia para não quebrar
const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""; 
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

const themes = [
  { name: 'restaurant', label: 'Bistrô', colorClass: 'bg-red-900', isPro: false },
  { name: 'light', label: 'Clean', colorClass: 'bg-gray-100', isPro: false },
  { name: 'dark', label: 'Pub', colorClass: 'bg-gray-900', isPro: false },
  { name: 'pizza', label: 'Pizzaria', colorClass: 'bg-orange-600', isPro: true },
  { name: 'sushi', label: 'Sushi', colorClass: 'bg-black border-b-4 border-red-600', isPro: true },
  { name: 'cafe', label: 'Café', colorClass: 'bg-amber-800', isPro: true },
  { name: 'burger', label: 'Burger', colorClass: 'bg-yellow-500', isPro: true },
  { name: 'ocean', label: 'Praia', colorClass: 'bg-blue-500', isPro: true },
];

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false); 
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false); // <--- ESTADO DO MODAL MANUAL

  // Campos do Prato
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCat, setNewItemCat] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [isUploadingItemImg, setIsUploadingItemImg] = useState(false);

  // Campos de Cupom
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed'>('percent');

  // Campos de Edição
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemCat, setEditItemCat] = useState('');
  const [editItemImage, setEditItemImage] = useState('');

  // Perfil e UI
  const [editingProfileTitle, setEditingProfileTitle] = useState('');
  const [editingProfileBio, setEditingProfileBio] = useState('');
  const [editingProfileAddress, setEditingProfileAddress] = useState('');
  const [editingProfileWhatsapp, setEditingProfileWhatsapp] = useState('');
  const [editingProfilePix, setEditingProfilePix] = useState('');
  const [isOpenStore, setIsOpenStore] = useState(true);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copiar Link');

  // Admin
  const isAdmin = userData?.role === 'admin';
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetUserEmail, setTargetUserEmail] = useState<string | null>(null); 
  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<(UserData & { uid: string }) | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  
  const [allUsers, setAllUsers] = useState<(UserData & { uid: string, createdAt?: any })[]>([]);

  const isProPlan = targetUserId ? true : (pageData?.plan === 'pro');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const existingCategories = Array.from(new Set(pageData?.links?.map(l => l.category).filter(Boolean) || []));

  // --- LÓGICA DE ASSINATURA MANUAL ---
  const handleSubscribeClick = () => {
    setIsUpgradeModalOpen(true); // Abre o Modal de Pix
  };

  // Mantido caso precise salvar CPF depois
  const saveFiscalDataAndSubscribe = async (cpf: string, phone: string) => {
    if (!user) return;
    setIsFiscalModalOpen(false);
    try {
        await updateUserFiscalData(user.uid, cpf, phone);
        alert("Dados salvos! Agora faça o Pix para liberar.");
        setIsUpgradeModalOpen(true);
    } catch (error) {
        alert("Erro ao salvar dados.");
    }
  };

  const uploadToCloudinary = async (file: File): Promise<string> => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        alert("Erro de configuração de imagem. Avise o suporte.");
        return "";
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.secure_url;
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

  const fetchPageData = useCallback(async () => {
    const idToFetch = targetUserId || user?.uid;
    if (idToFetch) {
      setIsLoadingData(true);
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
        if (loadedWhats.startsWith('55') && loadedWhats.length > 10) {
            loadedWhats = loadedWhats.substring(2);
        }
        setEditingProfileWhatsapp(loadedWhats);
        setEditingProfilePix((data as any).pixKey || '');
        
        setIsOpenStore(data.isOpen !== false);

        if (data.plan === 'pro' && data.trialDeadline) {
            const now = new Date();
            const deadline = data.trialDeadline.toDate();
            const diffTime = Math.abs(deadline.getTime() - now.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if (now > deadline) setDaysLeft(0); else setDaysLeft(diffDays);
        } else {
            setDaysLeft(null);
        }
      }
      setIsLoadingData(false);
    }
  }, [user, targetUserId]);

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

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!pageSlug || !newItemTitle) return;
    const current = pageData?.links || [];
    if (!isProPlan && current.length >= 8) {
        alert("⚠️ Limite do Plano Grátis Atingido (8 itens).\n\nFaça upgrade para o Plano Profissional!");
        return;
    }
    const newItem: LinkData = {
      title: newItemTitle, url: '', type: 'dish', order: current.length + 1, clicks: 0,
      price: newItemPrice, description: newItemDesc, imageUrl: newItemImage, category: newItemCat
    };
    await addLinkToPage(pageSlug, newItem);
    setNewItemTitle(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemImage(''); setNewItemCat('');
    fetchPageData();
  };

  const handleAddCoupon = async () => {
      if (!pageSlug || !newCouponCode || !newCouponValue) return;
      if (!isProPlan) { alert("Cupons são um recurso Pro!"); return; }
      const newCoupon: CouponData = {
          code: newCouponCode.toUpperCase().trim(),
          type: newCouponType,
          value: parseFloat(newCouponValue.replace(',', '.')),
          active: true
      };
      const updatedCoupons = [...(pageData?.coupons || []), newCoupon];
      await updatePageCoupons(pageSlug, updatedCoupons);
      setPageData(prev => prev ? { ...prev, coupons: updatedCoupons } : null);
      setNewCouponCode(''); setNewCouponValue('');
  };

  const handleDeleteCoupon = async (codeToDelete: string) => {
      if (!pageSlug) return;
      const updatedCoupons = (pageData?.coupons || []).filter(c => c.code !== codeToDelete);
      await updatePageCoupons(pageSlug, updatedCoupons);
      setPageData(prev => prev ? { ...prev, coupons: updatedCoupons } : null);
  };

  const handleUpdateItem = async (index: number) => {
    if (!pageSlug || !pageData) return;
    const updated = [...pageData.links];
    updated[index] = { ...updated[index], title: editItemTitle, price: editItemPrice, description: editItemDesc, imageUrl: editItemImage, category: editItemCat };
    await updateLinksOnPage(pageSlug, updated);
    setEditingIndex(null);
    fetchPageData();
  };

  const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNew: boolean) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsUploadingItemImg(true);
    try {
        const url = await uploadToCloudinary(file);
        if (isNew) setNewItemImage(url); else setEditItemImage(url);
    } catch (e) { alert("Erro upload imagem"); }
    setIsUploadingItemImg(false);
  };

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file || !pageSlug) return;
      setIsUploadingProfile(true);
      const url = await uploadToCloudinary(file);
      await updateProfileImage(pageSlug, url);
      setPageData(prev => prev ? {...prev, profileImageUrl: url} : null);
      setIsUploadingProfile(false);
  };
  
  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file || !pageSlug) return;
      if(!isProPlan) { alert("Recurso Pro!"); return; }
      setIsUploadingBg(true);
      const url = await uploadToCloudinary(file);
      await updatePageBackground(pageSlug, url);
      setPageData(prev => prev ? {...prev, backgroundImage: url} : null);
      setIsUploadingBg(false);
  };

  const handleSaveProfile = async () => {
      if(!pageSlug) return;
      if (!isProPlan) {
          if ((editingProfileAddress && editingProfileAddress !== pageData?.address) || 
              (editingProfilePix && editingProfilePix !== (pageData as any)?.pixKey)) {
              alert("Endereço e Pix são recursos do Plano Profissional."); 
              return;
          }
      }
      const whatsappToSave = editingProfileWhatsapp ? `55${editingProfileWhatsapp.replace(/\D/g, '')}` : '';
      await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio, isProPlan ? editingProfileAddress : '', isOpenStore, whatsappToSave, isProPlan ? editingProfilePix : '');
      setPageData(prev => prev ? {
          ...prev, 
          title: editingProfileTitle, 
          bio: editingProfileBio, 
          address: isProPlan ? editingProfileAddress : '', 
          isOpen: isOpenStore, 
          whatsapp: whatsappToSave,
          pixKey: isProPlan ? editingProfilePix : ''
      } : null);
      alert("Dados atualizados com sucesso!");
  };

  const handleCopyUrl = () => {
      if (!pageSlug) return;
      const url = `${window.location.origin}/${pageSlug}`;
      navigator.clipboard.writeText(url);
      setCopyButtonText("Copiado!");
      setTimeout(() => setCopyButtonText("Copiar Link"), 2000);
  };

  const handleThemeChange = async (themeName: string) => {
      if (!pageSlug) return;
      try { await updatePageTheme(pageSlug, themeName); setPageData(prev => prev ? { ...prev, theme: themeName } : null); }
      catch { alert("Erro ao mudar tema."); }
  };

  const handleSearchUser = async (e: FormEvent) => {
      e.preventDefault(); if(!searchEmail) return;
      setAdminMessage(null); setFoundUser(null);
      const user = await findUserByEmail(searchEmail);
      if(user) setFoundUser(user); else setAdminMessage("Não encontrado.");
  };

  const handleChangePlan = async (newPlan: 'free' | 'pro') => {
      if(!foundUser) return;
      setIsUpdatingPlan(true);
      try { await updateUserPlan(foundUser.uid, newPlan); setFoundUser(prev => prev ? {...prev, plan: newPlan} : null); setAdminMessage("Plano atualizado!"); }
      catch { setAdminMessage("Erro ao atualizar plano."); }
      finally { setIsUpdatingPlan(false); }
  };

  const handleManageUser = (uid: string, email: string | undefined) => {
    setTargetUserId(uid); setTargetUserEmail(email || 'Cliente');
    setAdminMessage(null); setFoundUser(null); setSearchEmail('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const signOut = signOutUser;

  if (loading || (!isAdmin && isLoadingData)) return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans relative">
      
      {/* MODAL MANUAL DE PIX */}
      <UpgradeModal 
        isOpen={isUpgradeModalOpen} 
        onClose={() => setIsUpgradeModalOpen(false)} 
      />
      
      <FiscalModal 
        isOpen={isFiscalModalOpen} 
        onClose={() => setIsFiscalModalOpen(false)} 
        onSave={saveFiscalDataAndSubscribe} 
      />

      <nav className="bg-white shadow-sm sticky top-0 z-20">
         <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
            <h1 className="font-bold text-gray-800 flex gap-2 items-center"><FaUtensils className="text-orange-500"/> Gestor de Cardápio</h1>
            <button onClick={() => signOut()} className="text-red-500 text-sm font-medium">Sair</button>
         </div>
      </nav>

      <main className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        
        {daysLeft !== null && (
            <div className={`p-4 rounded-xl flex items-center justify-between shadow-sm ${daysLeft > 0 ? 'bg-yellow-100 border border-yellow-300 text-yellow-800' : 'bg-red-100 border border-red-300 text-red-800'}`}>
                <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-full"><FaClock /></div>
                    <div>
                        <p className="font-bold text-sm">{daysLeft > 0 ? `Período de Teste Pro: Restam ${daysLeft} dias.` : 'Seu período de teste acabou.'}</p>
                        <p className="text-xs opacity-80">{daysLeft > 0 ? 'Aproveite todos os recursos liberados!' : 'Seus recursos Pro foram bloqueados. Assine para continuar.'}</p>
                    </div>
                </div>
                <button 
                    onClick={handleSubscribeClick}
                    disabled={isProcessing}
                    className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-800 disabled:opacity-50"
                >
                    {isProcessing ? 'Processando...' : 'Assinar Agora'}
                </button>
            </div>
        )}

        {/* ... (PERFIL, DIVULGAÇÃO, ETC - Tudo mantido igual) ... */}
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="relative w-24 h-24">
                    <div className="w-full h-full rounded-full overflow-hidden border-4 border-orange-100 relative bg-gray-100">
                        {pageData?.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="96px" /> : <FaCamera className="text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8"/>}
                    </div>
                    <label className="absolute bottom-0 right-0 bg-orange-500 text-white p-2 rounded-full cursor-pointer hover:bg-orange-600 shadow"><FaCamera size={12}/><input type="file" className="hidden" onChange={handleProfileUpload} disabled={isUploadingProfile}/></label>
                </div>
                <button onClick={() => setIsOpenStore(!isOpenStore)} className={`w-full py-1.5 px-3 rounded-full text-xs font-bold flex items-center justify-center gap-1 transition-colors ${isOpenStore ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>{isOpenStore ? <><FaDoorOpen/> Aberto</> : <><FaDoorClosed/> Fechado</>}</button>
            </div>
            <div className="flex-1 w-full space-y-3">
                <input type="text" value={editingProfileTitle} onChange={e => setEditingProfileTitle(e.target.value)} className="w-full text-lg font-bold border-b border-gray-300 focus:border-orange-500 outline-none" placeholder="Nome do Restaurante" />
                <textarea value={editingProfileBio} onChange={e => setEditingProfileBio(e.target.value)} className="w-full text-sm border rounded p-2 focus:border-orange-500 outline-none resize-none" rows={2} placeholder="Descrição / Horário de Funcionamento" />
                <div className="flex items-center border rounded-lg overflow-hidden bg-white border-gray-300 focus-within:border-green-500 transition-all">
                    <div className="bg-gray-100 px-3 py-2 border-r border-gray-200 flex items-center gap-1 text-gray-500 font-bold text-sm shrink-0"><FaWhatsapp className="text-green-500" /> +55</div>
                    <input type="tel" value={editingProfileWhatsapp} onChange={e => setEditingProfileWhatsapp(e.target.value.replace(/\D/g, ''))} className="w-full text-sm bg-transparent outline-none px-3 py-2" placeholder="DDD + Número (WhatsApp)" maxLength={11} />
                </div>
                <div className={`flex items-center gap-2 border rounded p-2 transition-colors ${isProPlan ? 'bg-gray-50 focus-within:border-blue-500 focus-within:bg-white' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}>
                    <FaKey className="text-blue-500" />
                    <input type="text" value={editingProfilePix} onChange={e => setEditingProfilePix(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Chave Pix (CPF, Email, Telefone)" : "Chave Pix (Recurso Pro)"} disabled={!isProPlan}/>
                    {!isProPlan && <FaLock className="text-gray-400" />}
                </div>
                <div className={`flex items-center gap-2 border rounded p-2 ${isProPlan ? 'bg-gray-50' : 'bg-gray-100 opacity-60 cursor-not-allowed'}`}>
                    <FaMapMarkerAlt className="text-gray-400" />
                    <input type="text" value={editingProfileAddress} onChange={e => setEditingProfileAddress(e.target.value)} className={`w-full text-sm bg-transparent outline-none ${!isProPlan ? 'cursor-not-allowed' : ''}`} placeholder={isProPlan ? "Endereço Completo" : "Endereço (Recurso Pro)"} disabled={!isProPlan} />
                    {!isProPlan && <FaLock className="text-gray-400" />}
                </div>
                <button onClick={handleSaveProfile} className="bg-orange-600 text-white px-4 py-2 rounded text-sm font-bold flex gap-2 hover:bg-orange-700 transition w-fit"><FaSave/> Salvar Dados</button>
            </div>
        </div>

        {pageSlug && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FaQrcode className="text-orange-500" /> Divulgação</h3>
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 bg-orange-50 border border-orange-200 p-4 rounded-xl flex flex-col justify-center">
                        <label className="text-orange-800 text-xs font-bold uppercase mb-2">Link do Cardápio</label>
                        <div className="flex gap-2">
                            <div className="flex-1 bg-white border border-orange-200 rounded px-3 py-2 text-sm text-gray-600 truncate flex items-center">{typeof window !== 'undefined' ? window.location.origin : ''}/{pageSlug}</div>
                            <button onClick={handleCopyUrl} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-bold text-sm transition flex items-center gap-2"><FaCopy /> {copyButtonText}</button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => isProPlan ? setShowQRCode(!showQRCode) : alert("QR Code é um recurso do plano Profissional.")} className={`${isProPlan ? 'bg-gray-800 hover:bg-gray-900' : 'bg-gray-400 cursor-not-allowed'} text-white px-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 min-w-[100px] transition py-3 relative`}>
                            <FaQrcode size={20} /> <span className="text-xs">{showQRCode ? 'Fechar' : 'QR Code'}</span>
                            {!isProPlan && <div className="absolute top-2 right-2"><FaLock size={10} /></div>}
                        </button>
                        <a href={`/${pageSlug}`} target="_blank" className="bg-white border-2 border-gray-200 hover:border-gray-400 text-gray-700 px-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 min-w-[100px] transition py-3">
                            <FaExternalLinkAlt size={18} /><span className="text-xs">Abrir</span>
                        </a>
                    </div>
                </div>
                {showQRCode && isProPlan && (
                    <div className="mt-6 flex justify-center bg-gray-50 p-8 rounded-xl border border-dashed border-gray-300 animate-in fade-in zoom-in">
                        <div className="text-center">
                            <div className="bg-white p-4 rounded-xl border-2 border-gray-100 inline-block mb-4 shadow-sm">
                                <QRCodeCanvas value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${pageSlug}`} size={200} level="H" />
                            </div>
                            <p className="text-sm font-bold text-gray-800">Aponte a câmera do celular</p>
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${!isProPlan ? 'opacity-70 pointer-events-none grayscale' : ''}`}>
             <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><FaTag className="text-purple-500" /> Cupons de Desconto</h3>
                 {!isProPlan && <span className="bg-gray-200 text-gray-500 text-xs px-2 py-1 rounded-full flex items-center gap-1 font-bold"><FaLock size={10}/> Recurso Pro</span>}
             </div>
             
             <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                 <div className="flex-1">
                     <label className="text-xs font-bold text-purple-800 uppercase mb-1 block">Código (Ex: VIP10)</label>
                     <input type="text" value={newCouponCode} onChange={e => setNewCouponCode(e.target.value.toUpperCase())} className="w-full p-2 rounded border border-purple-200 text-sm font-bold uppercase" placeholder="Código" />
                 </div>
                 <div className="flex-1">
                     <label className="text-xs font-bold text-purple-800 uppercase mb-1 block">Valor</label>
                     <input type="text" value={newCouponValue} onChange={e => setNewCouponValue(e.target.value)} className="w-full p-2 rounded border border-purple-200 text-sm" placeholder="Ex: 10 ou 5,00" />
                 </div>
                 <div className="flex-1">
                     <label className="text-xs font-bold text-purple-800 uppercase mb-1 block">Tipo</label>
                     <select value={newCouponType} onChange={e => setNewCouponType(e.target.value as 'percent' | 'fixed')} className="w-full p-2 rounded border border-purple-200 text-sm">
                         <option value="percent">Porcentagem (%)</option>
                         <option value="fixed">Valor Fixo (R$)</option>
                     </select>
                 </div>
                 <div className="flex items-end">
                     <button onClick={handleAddCoupon} className="bg-purple-600 text-white px-6 py-2 rounded font-bold text-sm hover:bg-purple-700 h-10 w-full md:w-auto">Criar</button>
                 </div>
             </div>

             <div className="space-y-2">
                 {pageData?.coupons && pageData.coupons.length > 0 ? (
                     pageData.coupons.map((coupon, idx) => (
                         <div key={idx} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                             <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center font-bold text-lg"><FaTag/></div>
                                 <div>
                                     <p className="font-bold text-gray-800">{coupon.code}</p>
                                     <p className="text-xs text-gray-500">{coupon.type === 'percent' ? `${coupon.value}% OFF` : `R$ ${coupon.value.toFixed(2)} OFF`}</p>
                                 </div>
                             </div>
                             <button onClick={() => handleDeleteCoupon(coupon.code)} className="text-red-400 hover:text-red-600 p-2"><FaTrashAlt/></button>
                         </div>
                     ))
                 ) : (
                     <p className="text-center text-gray-400 text-sm py-4">Nenhum cupom criado.</p>
                 )}
             </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex gap-2 items-center">
                <FaPlus className="text-green-500"/> Novo Prato
                {!isProPlan && <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded ml-auto">Free: {(pageData?.links?.length || 0)}/8</span>}
            </h3>
            <form onSubmit={handleAddItem} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div className="w-20 h-20 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center relative cursor-pointer hover:bg-gray-100 group shrink-0">
                        {newItemImage ? <Image src={newItemImage} alt="Prato" fill className="object-cover rounded" sizes="80px" /> : <FaCamera className="text-gray-400"/>}
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleItemImageUpload(e, true)} disabled={isUploadingItemImg} />
                        {isUploadingItemImg && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="animate-spin w-4 h-4 border-2 border-orange-500 rounded-full border-t-transparent"/></div>}
                    </div>
                    <div className="flex-1 space-y-3 w-full">
                        <div className="flex gap-3">
                            <input className="flex-1 border p-2 rounded text-sm outline-none focus:border-orange-500" placeholder="Nome do Prato" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} required />
                            <input className="w-24 border p-2 rounded text-sm outline-none focus:border-orange-500" placeholder="R$" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
                        </div>
                        <input className="w-full border p-2 rounded text-sm outline-none focus:border-orange-500" placeholder="Categoria (Ex: Bebidas, Lanches)" value={newItemCat} onChange={e => setNewItemCat(e.target.value)} list="categories-list" />
                        <datalist id="categories-list">{existingCategories.map((cat, i) => <option key={i} value={cat as string} />)}</datalist>
                        <input className="w-full border p-2 rounded text-sm outline-none focus:border-orange-500" placeholder="Descrição" value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} />
                    </div>
                </div>
                <button type="submit" className="w-full bg-green-600 text-white font-bold py-2 rounded hover:bg-green-700 transition">Adicionar ao Cardápio</button>
            </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Cardápio Atual</h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={pageData?.links?.map((l,i) => (l.url||l.title)+i) || []} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                        {pageData?.links?.map((link, index) => {
                            if (editingIndex === index) {
                                return (
                                    <div key={(link.url||link.title)+index} className="bg-orange-50 p-4 rounded border border-orange-200 space-y-3">
                                        <p className="text-xs font-bold text-orange-800 uppercase">Editando: {link.title}</p>
                                        <div className="flex gap-3">
                                            <div className="w-16 h-16 bg-white rounded relative border border-gray-200 shrink-0">
                                                {editItemImage ? <Image src={editItemImage} alt="Img" fill className="object-cover rounded" sizes="64px"/> : <div className="w-full h-full flex items-center justify-center text-gray-300"><FaImage/></div>}
                                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleItemImageUpload(e, false)} />
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <div className="flex gap-2">
                                                    <input className="flex-1 border p-1 rounded text-sm" value={editItemTitle} onChange={e => setEditItemTitle(e.target.value)} placeholder="Nome" />
                                                    <input className="w-20 border p-1 rounded text-sm" value={editItemPrice} onChange={e => setEditItemPrice(e.target.value)} placeholder="Preço" />
                                                </div>
                                                <input className="w-full border p-1 rounded text-sm" value={editItemCat} onChange={e => setEditItemCat(e.target.value)} placeholder="Categoria" list="categories-list" />
                                                <input className="w-full border p-1 rounded text-sm" value={editItemDesc} onChange={e => setEditItemDesc(e.target.value)} placeholder="Descrição" />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingIndex(null)} className="px-3 py-1 text-xs bg-white border rounded">Cancelar</button>
                                            <button onClick={() => handleUpdateItem(index)} className="px-3 py-1 text-xs bg-green-600 text-white rounded">Salvar</button>
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <SortableLinkItem 
                                    key={(link.url||link.title)+index} 
                                    link={link} index={index} 
                                    onEdit={() => { setEditingIndex(index); setEditItemTitle(link.title); setEditItemPrice(link.price||''); setEditItemDesc(link.description||''); setEditItemCat(link.category||''); setEditItemImage(link.imageUrl||''); }} 
                                    onDelete={async () => { if(confirm("Excluir?")) { await deleteLinkFromPage(pageSlug!, link); fetchPageData(); }}} 
                                    editingIndex={editingIndex} 
                                />
                            );
                        })}
                    </div>
                </SortableContext>
            </DndContext>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
             <h3 className="font-bold text-gray-800 mb-4">Aparência & Temas</h3>
             <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                 <label className="text-sm font-bold text-gray-700 mb-2 block items-center gap-2">
                    <FaImage /> Imagem de Fundo (Capa)
                    {!isProPlan && <span className="bg-gray-200 text-gray-500 text-xs px-2 rounded-full flex items-center gap-1"><FaLock size={10}/> Pro</span>}
                 </label>
                 <div className="flex items-center gap-4">
                    {pageData?.backgroundImage ? (
                        <div className="w-24 h-14 relative rounded-md overflow-hidden border border-gray-300 shadow-sm">
                            <Image src={pageData.backgroundImage} alt="Bg" fill className="object-cover" sizes="96px" />
                        </div>
                    ) : (
                        <div className="w-24 h-14 bg-gray-200 rounded-md border border-gray-300 flex items-center justify-center text-xs text-gray-400">Sem Capa</div>
                    )}
                    <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold transition ${isProPlan ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                        {isProPlan ? (isUploadingBg ? 'Enviando...' : 'Alterar Capa') : 'Bloqueado'}
                        <input type="file" onChange={handleBgUpload} disabled={!isProPlan} className="hidden" />
                    </label>
                 </div>
             </div>
             
             <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {themes.map(t => {
                    const locked = t.isPro && !isProPlan;
                    return (
                        <button key={t.name} onClick={() => { if(!locked) { updatePageTheme(pageSlug!, t.name); setPageData(prev => prev ? {...prev, theme: t.name} : null); }}} 
                                className={`p-2 border rounded text-center text-xs relative overflow-hidden ${pageData?.theme === t.name ? 'border-orange-500 bg-orange-50' : ''} ${locked ? 'opacity-60 bg-gray-100' : ''}`}>
                            <div className={`w-full h-6 rounded mb-1 ${t.colorClass}`}></div>
                            {t.label}
                            {locked && <div className="absolute inset-0 flex items-center justify-center bg-black/10"><FaLock className="text-white drop-shadow"/></div>}
                        </button>
                    )
                })}
             </div>
        </div>

        {isAdmin && (
            <div className="bg-gray-800 text-white p-6 rounded-xl border border-gray-700 mt-10">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><FaUsers/> Base de Usuários</h3>
                
                <div className="bg-gray-700 rounded-xl overflow-hidden mb-6">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-900 text-gray-400 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3">Data</th>
                                <th className="p-3">Nome</th>
                                <th className="p-3">Email</th>
                                <th className="p-3">Plano</th>
                                <th className="p-3">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-600">
                            {allUsers.map((u) => (
                                <tr key={u.uid} className="hover:bg-gray-600 transition">
                                    <td className="p-3 text-gray-400 text-xs">
                                        {u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="p-3 font-bold text-white">{u.displayName || 'Sem Nome'}</td>
                                    <td className="p-3 text-gray-300">{u.email}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${u.plan === 'pro' ? 'bg-orange-600 text-white' : 'bg-gray-500 text-gray-300'}`}>
                                            {u.plan ? u.plan.toUpperCase() : 'FREE'}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <button onClick={() => handleManageUser(u.uid, u.email)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold">
                                            Gerenciar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {allUsers.length === 0 && <p className="p-4 text-center text-gray-400">Carregando usuários...</p>}
                </div>

                <h4 className="font-bold text-sm mb-2 text-gray-400 flex items-center gap-2"><FaUserCog/> Busca Individual</h4>
                <form onSubmit={handleSearchUser} className="flex gap-2 mb-4">
                    <input type="email" value={searchEmail} onChange={e => setSearchEmail(e.target.value)} className="flex-1 p-2 rounded border border-gray-600 bg-gray-700 text-white outline-none" placeholder="Buscar por email específico..." />
                    <button className="bg-orange-600 text-white px-4 rounded font-bold hover:bg-orange-700"><FaSearch/></button>
                </form>
                {foundUser && (
                    <div className="bg-gray-900 p-4 rounded border border-gray-600">
                        <p className="font-bold text-orange-400">{foundUser.email}</p>
                        <p className="text-sm text-gray-300 mb-2">Plano Atual: <span className="font-bold text-white">{foundUser.plan?.toUpperCase()}</span></p>
                        <div className="flex gap-2">
                            <button onClick={() => handleChangePlan(foundUser.plan === 'free' ? 'pro' : 'free')} disabled={isUpdatingPlan} className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm font-bold">
                                {foundUser.plan === 'free' ? 'Dar Pro' : 'Tirar Pro'}
                            </button>
                            <button onClick={() => handleManageUser(foundUser.uid, foundUser.email)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-bold">Acessar Conta</button>
                        </div>
                    </div>
                )}
                {adminMessage && <p className="text-sm mt-2 text-yellow-400">{adminMessage}</p>}
            </div>
        )}
      </main>

      <a
        href="https://wa.me/5579996337995?text=Olá! Preciso de ajuda com o CardápioPro."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-50 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-full shadow-xl flex items-center gap-2 transition-transform transform hover:scale-105 font-bold animate-in fade-in zoom-in"
      >
        <FaWhatsapp size={24} />
        <span className="hidden md:block">Suporte</span>
      </a>

    </div>
  );
}