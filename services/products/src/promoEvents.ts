import cron from 'node-cron';
import { Producer } from 'kafkajs';
import { Registry, Counter, Gauge } from 'prom-client';

import { Product } from './models';

interface PromotionalEvent {
  timestamp: Date;
  products: any[];
  eventType: string;
  metadata: {
    source: string;
    batchId: string;
  };
}

// Prometheus metrics
function initializeMetrics(register: Registry) {
  const promoEventsTotal = new Counter({
    name: 'promotional_events_total',
    help: 'Total number of promotional events sent'
  });

  const promoEventsBatchSize = new Gauge({
    name: 'promotional_events_batch_size',
    help: 'Number of products in each promotional event batch'
  });

  const promoEventsError = new Counter({
    name: 'promotional_events_errors_total',
    help: 'Total number of errors in promotional events generation'
  });

  register.registerMetric(promoEventsTotal);
  register.registerMetric(promoEventsBatchSize);
  register.registerMetric(promoEventsError);

  return { promoEventsTotal, promoEventsBatchSize, promoEventsError };
}

// Generate and send promotional events
async function generatePromotionalEvents(
  producer: Producer,
  metrics: ReturnType<typeof initializeMetrics>
): Promise<void> {
  try {
    const products = await Product.find({ 
      quantity: { $gt: 0 } 
    });

    if (products.length === 0) {
      console.log('No products available for promotional events');
      return;
    }

    metrics.promoEventsBatchSize.set(products.length);

    const promoEvent: PromotionalEvent = {
      timestamp: new Date(),
      products: products,
      eventType: 'promotional-batch',
      metadata: {
        source: 'product-service-cron',
        batchId: Date.now().toString()
      }
    };

    await producer.send({
      topic: 'promotional-events',
      messages: [
        {
          value: JSON.stringify(promoEvent),
          key: promoEvent.metadata.batchId,
          timestamp: promoEvent.timestamp.getTime().toString()
        }
      ]
    });

    console.log(`Promotional event sent successfully. Batch ID: ${promoEvent.metadata.batchId}, Products: ${products.length}`);
    metrics.promoEventsTotal.inc();

  } catch (error) {
    console.error('Error generating promotional events:', error);
    metrics.promoEventsError.inc();
    throw error;
  }
}

// Promotional events system
export function initializePromotionalEvents(producer: Producer, register: Registry): void {
  const metrics = initializeMetrics(register);

  // Run every hour (0 * * * *)
  cron.schedule('*/5 * * * *', async () => {
    console.log('Starting promotional events generation');
    try {
      await generatePromotionalEvents(producer, metrics);
    } catch (error) {
      console.error('Promotional events cron job failed:', error);
    }
  });

  console.log('Promotional events cron job initialized');
}