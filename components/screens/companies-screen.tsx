"use client"

import { useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { StatusBadge } from "@/components/status-badge"
import { useData } from "@/lib/data-context"
import { CITIES } from "@/lib/cities"
import type { Company } from "@/lib/mock-data"
import {
  Search, Plus, ChevronRight, Globe, ExternalLink, RefreshCw, BarChart3,
  Upload, Building2, MapPin, Users, Linkedin, FileText, ImageIcon, Briefcase, X, Edit2, Save, Zap, ChevronsUpDown, Gift, Check
} from "lucide-react"

export function CompaniesScreen() {
  const { companies, jobs, addCompany, refreshJobs, refreshCompanies, isLoading } = useData()
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: "", description: "", website: "", careersUrl: "",
    linkedinUrl: "", industry: "", size: "", locations: [] as string[], portalType: "", benefits: [] as string[], companyType: "",
  })
  const [newBenefit, setNewBenefit] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [editLocationSearch, setEditLocationSearch] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add company form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    website: "",
    careersUrl: "",
    linkedinUrl: "",
    industry: "",
    size: "",
    locations: [] as string[],
    portalType: "",
    benefits: [] as string[],
    companyType: "",
    atsType: "",
    atsCompanyId: "",
  })

  const filteredCompanies = companies.filter((company) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return company.name.toLowerCase().includes(q) || company.industry.toLowerCase().includes(q)
  })

  const getCompanyJobs = (companyId: string) => {
    return jobs.filter((job) => job.companyId === companyId)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "", description: "", website: "", careersUrl: "",
      linkedinUrl: "", industry: "", size: "", locations: [], portalType: "", benefits: [], companyType: "",
      atsType: "", atsCompanyId: "",
    })
    setLogoPreview(null)
    setLogoFile(null)
    setNewBenefit("")
    setLocationSearch("")
  }

  const filteredCities = CITIES.filter(city =>
    city.toLowerCase().includes(locationSearch.toLowerCase())
  ).slice(0, 10)

  const startEditing = (company: Company) => {
    setIsEditing(true)
    setEditFormData({
      name: company.name,
      description: company.description || "",
      website: company.website || "",
      careersUrl: company.careersUrl || "",
      linkedinUrl: company.linkedinUrl || "",
      industry: company.industry || "",
      size: company.size || "",
      locations: Array.isArray(company.location) ? company.location : (company.location ? [company.location] : []),
      portalType: company.portalType || "",
      benefits: company.benefits || [],
      companyType: (company as any).companyType || "",
    })
    setEditLocationSearch("")
  }

  const handleUpdateCompany = async () => {
    if (!selectedCompany || isSaving) return
    setIsSaving(true)

    try {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedCompany.id,
          name: editFormData.name,
          description: editFormData.description || null,
          website: editFormData.website || null,
          careers_url: editFormData.careersUrl || null,
          linkedin_url: editFormData.linkedinUrl || null,
          industry: editFormData.industry || "Technology",
          size: editFormData.size || "Unknown",
          location: editFormData.locations.length > 0 ? editFormData.locations : ["Remote"],
          portal_type: editFormData.portalType || "Custom",
          benefits: editFormData.benefits,
          company_type: editFormData.companyType || "Other",
        }),
      })

      if (res.ok) {
        setIsEditing(false)
        setSelectedCompany(null)
      }
    } catch (err) {
      console.error("Error updating company:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCompany = async () => {
    if (!formData.name || isSaving) return
    setIsSaving(true)

    let logoUrl: string | null = null

    // Upload logo to Supabase Storage if a file was selected
    if (logoFile) {
      try {
        const uploadForm = new FormData()
        uploadForm.append("file", logoFile)
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadForm,
        })
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          logoUrl = uploadData.url
        }
      } catch (err) {
        console.error("Logo upload failed:", err)
      }
    }

    const result = await addCompany({
      name: formData.name,
      logo_url: logoUrl,
      website: formData.website,
      careers_url: formData.careersUrl,
      linkedin_url: formData.linkedinUrl || null,
      description: formData.description || null,
      industry: formData.industry || "Technology",
      size: formData.size || "Unknown",
      location: formData.locations.length > 0 ? formData.locations : ["Remote"],
      portal_type: formData.portalType || "Custom",
      benefits: formData.benefits,
      company_type: formData.companyType || "Other",
      ats_type: formData.atsType || null,
      ats_company_id: formData.atsCompanyId || null,
    })

    setIsSaving(false)
    if (result) {
      setShowAddForm(false)
      resetForm()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all companies and their job portals</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-secondary text-secondary-foreground">{companies.length} total</Badge>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" /> Add Company
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search companies..." className="pl-9 bg-card border-border" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCompanies.map((company) => (
          <Card key={company.id} className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedCompany(company)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt={company.name} className="h-10 w-10 rounded-lg object-cover" crossOrigin="anonymous" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
                      {company.logoInitial}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold">{company.name}</p>
                    <p className="text-[11px] text-muted-foreground">{company.industry}</p>
                  </div>
                </div>
                <StatusBadge status={company.portalStatus} />
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center rounded-md bg-accent/50 py-2">
                  <p className="text-lg font-bold">{company.totalJobs}</p>
                  <p className="text-[10px] text-muted-foreground">Jobs</p>
                </div>
                <div className="text-center rounded-md bg-accent/50 py-2">
                  <p className="text-lg font-bold">{company.appsToday}</p>
                  <p className="text-[10px] text-muted-foreground">Today</p>
                </div>
                <div className="text-center rounded-md bg-accent/50 py-2">
                  <p className="text-lg font-bold">{company.successRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Success</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{company.portalType}</span>
                <span>Avg: {company.avgTime}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Company Dialog */}
      <Dialog open={showAddForm} onOpenChange={(open) => { if (!open) { setShowAddForm(false); resetForm() } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              Add New Company
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 mt-2">
            {/* Logo Upload */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Company Logo</Label>
              <div className="flex items-center gap-4">
                <div
                  className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-accent/30 cursor-pointer hover:border-primary/40 transition-colors overflow-hidden"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <>
                      <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); setLogoPreview(null) }}
                        className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline" size="sm" className="text-xs gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" /> Upload Logo
                  </Button>
                  <p className="text-[11px] text-muted-foreground">PNG, JPG, or SVG. Max 2MB.</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>

            {/* Company Name */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-name" className="text-sm font-medium">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="company-name"
                  placeholder="e.g. Uber Technologies"
                  className="pl-9 bg-accent/30 border-border"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-desc" className="text-sm font-medium">Description</Label>
              <Textarea
                id="company-desc"
                placeholder="Brief description of the company..."
                className="bg-accent/30 border-border min-h-[80px] resize-none"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Two-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Website */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-website" className="text-sm font-medium">Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company-website"
                    placeholder="e.g. uber.com"
                    className="pl-9 bg-accent/30 border-border"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              {/* Careers URL */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-careers" className="text-sm font-medium">Careers Page URL</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company-careers"
                    placeholder="e.g. uber.com/careers"
                    className="pl-9 bg-accent/30 border-border"
                    value={formData.careersUrl}
                    onChange={(e) => setFormData({ ...formData, careersUrl: e.target.value })}
                  />
                </div>
              </div>

              {/* LinkedIn */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-linkedin" className="text-sm font-medium">LinkedIn Page</Label>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company-linkedin"
                    placeholder="e.g. linkedin.com/company/uber"
                    className="pl-9 bg-accent/30 border-border"
                    value={formData.linkedinUrl}
                    onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                  />
                </div>
              </div>

              {/* Locations */}
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label className="text-sm font-medium">Locations (Multiple)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-accent/30 hover:bg-accent/50 transition-colors text-sm text-left">
                      <span className="text-muted-foreground">
                        {formData.locations.length > 0 ? `${formData.locations.length} location(s) selected` : "Select locations..."}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 bg-card border-border" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search cities..."
                        value={locationSearch}
                        onValueChange={setLocationSearch}
                        className="border-b border-border"
                      />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No cities found.</CommandEmpty>
                        <CommandGroup>
                          {filteredCities.map((city) => (
                            <CommandItem
                              key={city}
                              value={city}
                              onSelect={() => {
                                setFormData({
                                  ...formData,
                                  locations: formData.locations.includes(city)
                                    ? formData.locations.filter(l => l !== city)
                                    : [...formData.locations, city]
                                })
                              }}
                              className="cursor-pointer"
                            >
                              <Checkbox
                                checked={formData.locations.includes(city)}
                                className="mr-2"
                              />
                              {city}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formData.locations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.locations.map((loc) => (
                      <Badge key={loc} variant="secondary" className="gap-1.5 text-xs">
                        {loc}
                        <button
                          onClick={() => setFormData({
                            ...formData,
                            locations: formData.locations.filter(l => l !== loc)
                          })}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Industry */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Industry</Label>
                <Select value={formData.industry} onValueChange={(v) => setFormData({ ...formData, industry: v })}>
                  <SelectTrigger className="bg-accent/30 border-border">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Healthcare">Healthcare</SelectItem>
                    <SelectItem value="Entertainment">Entertainment</SelectItem>
                    <SelectItem value="Automotive">Automotive</SelectItem>
                    <SelectItem value="E-commerce">E-commerce</SelectItem>
                    <SelectItem value="Education">Education</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Placeholder for grid alignment */}
              <div />

              {/* Company Size */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Company Size</Label>
                <Select value={formData.size} onValueChange={(v) => setFormData({ ...formData, size: v })}>
                  <SelectTrigger className="bg-accent/30 border-border">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="1-50">1-50 employees</SelectItem>
                    <SelectItem value="51-200">51-200 employees</SelectItem>
                    <SelectItem value="201-1000">201-1,000 employees</SelectItem>
                    <SelectItem value="1001-5000">1,001-5,000 employees</SelectItem>
                    <SelectItem value="5001-10000">5,001-10,000 employees</SelectItem>
                    <SelectItem value="10000+">10,000+ employees</SelectItem>
                    <SelectItem value="100000+">100,000+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Company Type */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Company Type</Label>
              <Select value={formData.companyType} onValueChange={(v) => setFormData({ ...formData, companyType: v })}>
                <SelectTrigger className="bg-accent/30 border-border">
                  <SelectValue placeholder="Select company type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Startup">Startup (0-2 years)</SelectItem>
                  <SelectItem value="Early Stage Startup">Early Stage Startup (2-5 years)</SelectItem>
                  <SelectItem value="Growth Stage">Growth Stage (5-10 years)</SelectItem>
                  <SelectItem value="Mid-sized Company">Mid-sized Company (100-1000 employees)</SelectItem>
                  <SelectItem value="Large Company">Large Company (1000-10000 employees)</SelectItem>
                  <SelectItem value="Enterprise">Enterprise (10000+ employees)</SelectItem>
                  <SelectItem value="Multinational Corporation">Multinational Corporation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-px bg-border" />

            {/* ATS Integration Section */}
            <div className="flex flex-col gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">ATS Integration (Optional)</h3>
              </div>
              <p className="text-xs text-muted-foreground">If this company uses Greenhouse, Lever, or Ashby, you can automatically sync jobs from their ATS API</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">ATS Platform</Label>
                  <Select value={formData.atsType} onValueChange={(v) => setFormData({ ...formData, atsType: v })}>
                    <SelectTrigger className="bg-accent/30 border-border">
                      <SelectValue placeholder="Select ATS (optional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="greenhouse">Greenhouse</SelectItem>
                      <SelectItem value="lever">Lever</SelectItem>
                      <SelectItem value="ashby">Ashby</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">ATS Company ID</Label>
                  <Input
                    placeholder="e.g. stripe, airbnb, notion"
                    className="bg-accent/30 border-border"
                    value={formData.atsCompanyId}
                    onChange={(e) => setFormData({ ...formData, atsCompanyId: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">The company identifier in the ATS URL</p>
                </div>
              </div>
              
              {formData.atsType && formData.atsCompanyId && (
                <div className="text-xs bg-accent/30 rounded-md p-2">
                  <span className="text-muted-foreground">API URL: </span>
                  <span className="font-mono text-[10px]">
                    {formData.atsType === "greenhouse" && `https://api.greenhouse.io/v1/boards/${formData.atsCompanyId}/jobs`}
                    {formData.atsType === "lever" && `https://api.lever.co/v0/postings/${formData.atsCompanyId}`}
                    {formData.atsType === "ashby" && `https://api.ashbyhq.com/posting-api/job-board/${formData.atsCompanyId}`}
                  </span>
                </div>
              )}
            </div>

            {/* Benefits */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                Company Benefits
              </Label>
              <p className="text-[11px] text-muted-foreground">These benefits will apply to all jobs at this company</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Health insurance, 401k matching"
                  className="bg-accent/30 border-border flex-1"
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      if (newBenefit.trim()) {
                        setFormData({ ...formData, benefits: [...formData.benefits, newBenefit.trim()] })
                        setNewBenefit("")
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    if (newBenefit.trim()) {
                      setFormData({ ...formData, benefits: [...formData.benefits, newBenefit.trim()] })
                      setNewBenefit("")
                    }
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {formData.benefits.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {formData.benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-accent/30 rounded-md px-3 py-1.5">
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="flex-1">{b}</span>
                      <button
                        onClick={() => setFormData({ ...formData, benefits: formData.benefits.filter((_, idx) => idx !== i) })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => { setShowAddForm(false); resetForm() }} className="text-xs">
              Cancel
            </Button>
            <Button
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={handleAddCompany}
              disabled={!formData.name || isSaving}
            >
              <Plus className="h-3 w-3" /> {isSaving ? "Saving..." : "Add Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company Detail Modal */}
      <Dialog open={!!selectedCompany} onOpenChange={() => { setSelectedCompany(null); setIsEditing(false) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {selectedCompany && !isEditing && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedCompany.logoUrl ? (
                      <img src={selectedCompany.logoUrl} alt={selectedCompany.name} className="h-10 w-10 rounded-lg object-cover" crossOrigin="anonymous" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
                        {selectedCompany.logoInitial}
                      </div>
                    )}
                    <div>
                      <DialogTitle className="text-lg">{selectedCompany.name}</DialogTitle>
                      <p className="text-xs text-muted-foreground">{selectedCompany.industry} - {selectedCompany.size} employees</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => startEditing(selectedCompany)}>
                    <Edit2 className="h-3 w-3" /> Edit
                  </Button>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                {selectedCompany.description && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">About</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedCompany.description}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Company Information</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Website</span>
                    <span className="font-medium flex items-center gap-1">{selectedCompany.website} <ExternalLink className="h-3 w-3" /></span>
                    <span className="text-muted-foreground">Careers</span>
                    <span className="font-medium flex items-center gap-1">{selectedCompany.careersUrl} <ExternalLink className="h-3 w-3" /></span>
                    {selectedCompany.linkedinUrl && (
                      <>
                        <span className="text-muted-foreground">LinkedIn</span>
                        <span className="font-medium flex items-center gap-1">{selectedCompany.linkedinUrl} <ExternalLink className="h-3 w-3" /></span>
                      </>
                    )}
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium">
                      {Array.isArray(selectedCompany.location)
                        ? selectedCompany.location.join(", ")
                        : selectedCompany.location}
                    </span>
                    <span className="text-muted-foreground">Added</span>
                    <span className="font-medium">{selectedCompany.addedAt}</span>
                    <span className="text-muted-foreground">Portal Status</span>
                    <StatusBadge status={selectedCompany.portalStatus} />
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Portal Configuration</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Portal Type</span>
                    <span className="font-medium">{selectedCompany.portalType}</span>
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className="font-medium">{selectedCompany.successRate}%</span>
                    <span className="text-muted-foreground">Avg Time</span>
                    <span className="font-medium">{selectedCompany.avgTime} per application</span>
                    <span className="text-muted-foreground">Rate Limit</span>
                    <span className="font-medium">100 apps/hour</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portal Health Check</h3>
                    <StatusBadge status={selectedCompany.portalStatus} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-sm font-bold">245ms</p>
                      <p className="text-[10px] text-muted-foreground">Response Time</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">99.8%</p>
                      <p className="text-[10px] text-muted-foreground">Uptime (24h)</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">2m ago</p>
                      <p className="text-[10px] text-muted-foreground">Last Check</p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Jobs at {selectedCompany.name}
                    </h3>
                    <Badge variant="secondary" className="bg-secondary text-secondary-foreground text-[10px]">
                      {getCompanyJobs(selectedCompany.id).length} jobs
                    </Badge>
                  </div>
                  {getCompanyJobs(selectedCompany.id).length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {getCompanyJobs(selectedCompany.id).map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{job.title}</span>
                              <StatusBadge status={job.status} />
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
                              <span>{job.type}</span>
                              <span>{job.salaryRange}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{job.totalApps} apps</span>
                            <span>{job.successRate}%</span>
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
                      <Briefcase className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No jobs added yet</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Add jobs from the Jobs section</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  {(selectedCompany as any).atsType && (selectedCompany as any).atsCompanyId ? (
                    <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={async () => {
                      setIsSaving(true)
                      try {
                        console.log('Starting ATS sync for:', selectedCompany.name)
                        const res = await fetch("/api/ats-sync", { 
                          method: "POST", 
                          headers: { "Content-Type": "application/json" }, 
                          body: JSON.stringify({ 
                            companyId: selectedCompany.id,
                            atsType: (selectedCompany as any).atsType,
                            atsCompanyId: (selectedCompany as any).atsCompanyId
                          }) 
                        })
                        console.log('Response status:', res.status)
                        const data = await res.json()
                        console.log('Response data:', data)
                        if (data.error) {
                          alert(`Error: ${data.error}`)
                        } else {
                          alert(`${data.message}\nTotal found: ${data.totalFound}\nAdded: ${data.addedCount}`)
                          // Refresh the data context instead of full page reload
                          await Promise.all([refreshJobs(), refreshCompanies()])
                          // Close and reopen the modal to show updated data
                          const currentCompanyId = selectedCompany.id
                          setSelectedCompany(null)
                          setTimeout(() => {
                            const updatedCompany = companies.find(c => c.id === currentCompanyId)
                            if (updatedCompany) setSelectedCompany(updatedCompany)
                          }, 500)
                        }
                      } catch (err) {
                        console.error('Sync error:', err)
                        alert(`Failed to sync jobs from ATS: ${err}`)
                      } finally {
                        setIsSaving(false)
                      }
                    }} disabled={isSaving}>
                      <Zap className="h-3 w-3" /> {isSaving ? "Syncing..." : `Sync from ${(selectedCompany as any).atsType}`}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={async () => {
                      setIsSaving(true)
                      try {
                        const res = await fetch("/api/sync-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: selectedCompany.id }) })
                        const data = await res.json()
                        alert(`Synced ${data.addedCount || 0} new jobs`)
                      } catch (err) {
                        alert("Failed to sync jobs")
                      } finally {
                        setIsSaving(false)
                      }
                    }} disabled={isSaving}>
                      <Zap className="h-3 w-3" /> {isSaving ? "Syncing..." : "Sync Jobs"}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {selectedCompany && isEditing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Edit2 className="h-5 w-5 text-primary" />
                  Edit Company
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Company Name</Label>
                  <Input className="bg-accent/30 border-border" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} />
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Description</Label>
                  <Textarea className="bg-accent/30 border-border min-h-[80px] resize-none" value={editFormData.description} onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Website</Label>
                    <Input className="bg-accent/30 border-border" value={editFormData.website} onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Careers URL</Label>
                    <Input className="bg-accent/30 border-border" value={editFormData.careersUrl} onChange={(e) => setEditFormData({ ...editFormData, careersUrl: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">LinkedIn</Label>
                    <Input className="bg-accent/30 border-border" value={editFormData.linkedinUrl} onChange={(e) => setEditFormData({ ...editFormData, linkedinUrl: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <Label className="text-sm font-medium">Locations (Multiple)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-accent/30 hover:bg-accent/50 transition-colors text-sm text-left">
                          <span className="text-muted-foreground">
                            {editFormData.locations.length > 0 ? `${editFormData.locations.length} location(s) selected` : "Select locations..."}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0 bg-card border-border" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search cities..."
                            value={editLocationSearch}
                            onValueChange={setEditLocationSearch}
                            className="border-b border-border"
                          />
                          <CommandList className="max-h-[200px]">
                            <CommandEmpty>No cities found.</CommandEmpty>
                            <CommandGroup>
                              {CITIES.filter(city =>
                                city.toLowerCase().includes(editLocationSearch.toLowerCase())
                              ).slice(0, 10).map((city) => (
                                <CommandItem
                                  key={city}
                                  value={city}
                                  onSelect={() => {
                                    setEditFormData({
                                      ...editFormData,
                                      locations: editFormData.locations.includes(city)
                                        ? editFormData.locations.filter(l => l !== city)
                                        : [...editFormData.locations, city]
                                    })
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Checkbox
                                    checked={editFormData.locations.includes(city)}
                                    className="mr-2"
                                  />
                                  {city}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {editFormData.locations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {editFormData.locations.map((loc) => (
                          <Badge key={loc} variant="secondary" className="gap-1.5 text-xs">
                            {loc}
                            <button
                              onClick={() => setEditFormData({
                                ...editFormData,
                                locations: editFormData.locations.filter(l => l !== loc)
                              })}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Industry</Label>
                    <Select value={editFormData.industry} onValueChange={(v) => setEditFormData({ ...editFormData, industry: v })}>
                      <SelectTrigger className="bg-accent/30 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="Technology">Technology</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="Healthcare">Healthcare</SelectItem>
                        <SelectItem value="Entertainment">Entertainment</SelectItem>
                        <SelectItem value="Automotive">Automotive</SelectItem>
                        <SelectItem value="E-commerce">E-commerce</SelectItem>
                        <SelectItem value="Education">Education</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Company Size</Label>
                    <Select value={editFormData.size} onValueChange={(v) => setEditFormData({ ...editFormData, size: v })}>
                      <SelectTrigger className="bg-accent/30 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="1-50">1-50 employees</SelectItem>
                        <SelectItem value="51-200">51-200 employees</SelectItem>
                        <SelectItem value="201-1000">201-1,000 employees</SelectItem>
                        <SelectItem value="1001-5000">1,001-5,000 employees</SelectItem>
                        <SelectItem value="5001-10000">5,001-10,000 employees</SelectItem>
                        <SelectItem value="10000+">10,000+ employees</SelectItem>
                        <SelectItem value="100000+">100,000+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Portal Type</Label>
                  <Select value={editFormData.portalType} onValueChange={(v) => setEditFormData({ ...editFormData, portalType: v })}>
                    <SelectTrigger className="bg-accent/30 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Greenhouse">Greenhouse</SelectItem>
                      <SelectItem value="Lever">Lever</SelectItem>
                      <SelectItem value="Workday">Workday</SelectItem>
                      <SelectItem value="iCIMS">iCIMS</SelectItem>
                      <SelectItem value="Taleo">Taleo</SelectItem>
                      <SelectItem value="Custom">Custom Portal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">Company Type</Label>
                  <Select value={editFormData.companyType} onValueChange={(v) => setEditFormData({ ...editFormData, companyType: v })}>
                    <SelectTrigger className="bg-accent/30 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Startup">Startup (0-2 years)</SelectItem>
                      <SelectItem value="Early Stage Startup">Early Stage Startup (2-5 years)</SelectItem>
                      <SelectItem value="Growth Stage">Growth Stage (5-10 years)</SelectItem>
                      <SelectItem value="Mid-sized Company">Mid-sized Company (100-1000 employees)</SelectItem>
                      <SelectItem value="Large Company">Large Company (1000-10000 employees)</SelectItem>
                      <SelectItem value="Enterprise">Enterprise (10000+ employees)</SelectItem>
                      <SelectItem value="Multinational Corporation">Multinational Corporation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                  Company Benefits
                </Label>
                <p className="text-[11px] text-muted-foreground">These benefits apply to all jobs at this company</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Health insurance, 401k matching"
                    className="bg-accent/30 border-border flex-1"
                    value={newBenefit}
                    onChange={(e) => setNewBenefit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        if (newBenefit.trim()) {
                          setEditFormData({ ...editFormData, benefits: [...editFormData.benefits, newBenefit.trim()] })
                          setNewBenefit("")
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      if (newBenefit.trim()) {
                        setEditFormData({ ...editFormData, benefits: [...editFormData.benefits, newBenefit.trim()] })
                        setNewBenefit("")
                      }
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {editFormData.benefits.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    {editFormData.benefits.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-accent/30 rounded-md px-3 py-1.5">
                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                        <span className="flex-1">{b}</span>
                        <button
                          onClick={() => setEditFormData({
                            ...editFormData,
                            benefits: editFormData.benefits.filter((_, idx) => idx !== i)
                          })}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)} className="text-xs">
                  Cancel
                </Button>
                <Button className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" onClick={handleUpdateCompany} disabled={isSaving}>
                  <Save className="h-3 w-3" /> {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
