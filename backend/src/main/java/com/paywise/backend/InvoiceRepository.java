
package com.paywise.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    Optional<Invoice> findByPaypalOrderId(String paypalOrderId);

}
