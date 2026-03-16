import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function PublicReport({ token }: { token: string }) {
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select(`
          *,
          vehicles(*),
          customers(*)
        `)
        .eq("public_token", token)
        .single();

      setOrder(data);
    };

    load();
  }, [token]);

  if (!order) return <div>Cargando diagnóstico...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>Diagnóstico del vehículo</h1>

      <h2>{order.vehicles?.plate}</h2>

      <p>
        <strong>Cliente:</strong> {order.customers?.name}
      </p>

      <p>
        <strong>Diagnóstico:</strong>
      </p>

      <p>{order.description}</p>

      <h3>Presupuesto: {order.total_estimated} €</h3>
    </div>
  );
}