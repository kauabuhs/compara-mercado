"use client";

import { DISPLAY_NAME_MAX, PUBLIC_NICKNAME_MAX } from "@contracts";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/primitives";
import { formatPhoneForDisplay } from "@/lib/phone";
import { type ProfileFormState, updateProfileAction } from "@/modules/account/actions";

const IDLE: ProfileFormState = { status: "idle" };

export interface ProfileFormProps {
  email: string | null;
  displayName: string | null;
  /** Apelido que as outras pessoas veem na Comunidade (vazio = "Colaborador #XXXX"). */
  publicNickname: string | null;
  /** Telefone em E.164, como a API devolve. */
  phone: string | null;
  cityId: string | null;
  cities: { id: string; name: string; uf: string }[];
}

export function ProfileForm({
  email,
  displayName,
  publicNickname,
  phone,
  cityId,
  cities,
}: ProfileFormProps) {
  const [state, action, pending] = useActionState(updateProfileAction, IDLE);
  const [nameValue, setNameValue] = useState(displayName ?? "");
  const [nicknameValue, setNicknameValue] = useState(publicNickname ?? "");
  const [phoneValue, setPhoneValue] = useState(formatPhoneForDisplay(phone));
  const [cityValue, setCityValue] = useState(cityId ?? "");

  // Depois de salvar, a página é revalidada e chegam os valores gravados (com o telefone já
  // normalizado): o formulário passa a mostrá-los, em vez de continuar com o que foi digitado.
  useEffect(() => {
    setNameValue(displayName ?? "");
    setNicknameValue(publicNickname ?? "");
    setPhoneValue(formatPhoneForDisplay(phone));
    setCityValue(cityId ?? "");
  }, [displayName, publicNickname, phone, cityId]);

  const errors = state.fieldErrors ?? {};
  const formError =
    state.status === "error" && Object.keys(errors).length === 0 ? state.message : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="displayName" label="Como quer ser chamado?" error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          required
          maxLength={DISPLAY_NAME_MAX}
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={errors.displayName ? "displayName-erro" : undefined}
        />
      </Field>

      <Field
        id="publicNickname"
        label="Apelido na Comunidade (opcional)"
        hint="É o que as outras pessoas veem nos preços que você publica. Sem apelido, aparece “Colaborador #XXXX”. Nunca mostramos o seu nome."
        error={errors.publicNickname}
      >
        <Input
          id="publicNickname"
          name="publicNickname"
          autoComplete="off"
          maxLength={PUBLIC_NICKNAME_MAX}
          placeholder="Ex.: Maria do Centro"
          value={nicknameValue}
          onChange={(event) => setNicknameValue(event.target.value)}
          aria-invalid={errors.publicNickname ? true : undefined}
          aria-describedby={errors.publicNickname ? "publicNickname-erro" : "publicNickname-dica"}
        />
      </Field>

      <Field
        id="email"
        label="E-mail"
        hint="É com ele que você entra. Não aparece para outras pessoas."
      >
        <Input
          id="email"
          type="email"
          value={email ?? ""}
          readOnly
          aria-describedby="email-dica"
          className="text-muted-foreground"
        />
      </Field>

      <Field
        id="phone"
        label="Telefone (opcional)"
        hint="Com DDD. Usamos só para falar com você sobre os seus envios."
        error={errors.phone}
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(54) 99999-0000"
          value={phoneValue}
          onChange={(event) => setPhoneValue(event.target.value)}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "phone-erro" : "phone-dica"}
        />
      </Field>

      <Field
        id="cityId"
        label="Cidade (opcional)"
        hint="Mostramos primeiro os preços da sua cidade."
        error={errors.cityId}
      >
        <Select
          id="cityId"
          name="cityId"
          value={cityValue}
          onChange={(event) => setCityValue(event.target.value)}
          aria-invalid={errors.cityId ? true : undefined}
          aria-describedby={errors.cityId ? "cityId-erro" : "cityId-dica"}
        >
          <option value="">Não informar</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name} - {city.uf}
            </option>
          ))}
        </Select>
      </Field>

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      {state.status === "saved" ? (
        <p role="status" className="text-sm text-success-soft-foreground">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full" size="lg">
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
